// Premium editorial renderer for YOGO Social Studio.
// Produces 6 unique photo-led Korean JPEGs: 3 AI photos + deterministic typography.
// The user must explicitly click the premium button (billable API usage).
import satori from "satori";
import sharp from "sharp";
import {env,base} from "./studio.js";

const SIZE = {width:1080,height:1350};
const MODEL = () => env("OPENAI_IMAGE_MODEL") || "gpt-image-2.5-flare";
const QUALITY = () => ["low","medium","high"].includes(env("OPENAI_IMAGE_QUALITY")) ? env("OPENAI_IMAGE_QUALITY") : "medium";
const FONT_URL = "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf";
let koreanFont = null;
const text = (value,styles={}) => ({type:"div",props:{style:{display:"flex",whiteSpace:"pre-wrap",fontFamily:"Noto",...styles},children:String(value||"")}});
const layer = (children,styles={}) => ({type:"div",props:{style:{display:"flex",boxSizing:"border-box",...styles},children}});
const place=(children,x,y,w,h,styles={})=>layer(children,{position:"absolute",left:x,top:y,width:w,height:h,...styles});
const rgb={fashion:{paper:"#F1EAE1",ink:"#262522",accent:"#816650"},yogo:{paper:"#F3F1EB",ink:"#27292B",accent:"#696B66"}};
function copySafe(s,max=150){return String(s||"").replace(/[\u0000-\u001f]+/g," ").trim().slice(0,max)}
function lines(s,max=13,limit=4){
  const words=String(s||"").replace(/\r/g,"").split("\n");const out=[];
  for(const line of words){
    let acc="";
    for(const char of line){
      if(acc.length>=max){out.push(acc);acc="";if(out.length>=limit)return out.join("\n")}
      acc+=char;
    }
    if(acc)out.push(acc);
    if(out.length>=limit)break;
  }
  return out.join("\n");
}
async function font(){
  if(koreanFont)return koreanFont;
  const r=await fetch(FONT_URL,{signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error("Korean font fetch: "+r.status);
  koreanFont=Buffer.from(await r.arrayBuffer());
  if(koreanFont.length<1_000_000||koreanFont.length>26_000_000)throw Error("Korean font file invalid");
  return koreanFont;
}
function photographicPrompt(channel,topic,slide,scene){
  const fashion=channel==="fashion";
  const purpose=fashion
    ?"A contemporary Korean streetwear fashion editorial: realistic stylish everyday outfit details, worn-in quality materials, people casually dressed (faces not in focus), hands styling clothes, candid wardrobe moment, believable urban Korean apartment or sidewalk setting."
    :"A contemporary Korean shopping lifestyle editorial: REALISTIC hands using a daily-life object or comparing unbranded objects, natural lived-in desk, household, kitchen or personal bag situation relevant to the buying decision. The scene must communicate the everyday shopping decision visually.";
  const angle=[
    "Wide editorial environment photo with a clear strong focal point, subtle authentic imperfection.",
    "Close-up photojournalistic detail of hands, packaging or texture in authentic use, beautiful depth.",
    "Unexpected natural side-angle documentary still frame with well-chosen props, not a staged flat lay."
  ][scene];
  return [
    "One single photorealistic magazine photograph, portrait 4:5 composition. Not an illustration or graphic layout.",
    "Visual topic:",topic+".","Card insight:",copySafe(slide?.title,60)+".",
    purpose,angle,
    "ART DIRECTION: Korean contemporary digital magazine and 29CM-style lifestyle editorial; observational photography, subtle daylight, candid not stock.",
    "Natural believable human scale, tactile detail, tasteful desaturated color, slight film grain, slightly imperfect spontaneous composition.",
    "Real architecture and mundane details are encouraged; avoid generic pastel gifts, staged shopping bags, floating items, irrelevant flowers, velvet and decorative ribbons.",
    "Use authentic looking neutral product props; no real logos, no brand names, no fictional prices, no user review quotes.",
    "Absolutely NO TEXT, NO LETTERING, NO TYPOGRAPHY, NO WATERMARK, NO UI mockups, NO multi-panel collage, NO decorative graphics.",
    "Do not depict a real product as an endorsed item. Image is conceptual editorial photography only.",
    "Photographic lighting and striking framing; each image should feel like a different photograph in the same curated magazine series."
  ].join(" ");
}
async function imageRequest(channel,topic,slide,scene){
  const key=env("OPENAI_API_KEY");
  if(!key)throw Error("OPENAI_API_KEY 등록이 필요합니다");
  const r=await fetch("https://api.openai.com/v1/images/generations",{
    method:"POST",signal:AbortSignal.timeout(110_000),
    headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
    body:JSON.stringify({model:MODEL(),prompt:photographicPrompt(channel,topic,slide,scene),
      n:1,size:"1024x1536",quality:QUALITY(),output_format:"jpeg",background:"opaque"})
  });
  const raw=await r.json();
  if(!r.ok)throw Error("이미지 AI "+r.status+": "+String(raw.error?.message||"생성 실패").slice(0,110));
  const base64=raw.data?.[0]?.b64_json;
  if(typeof base64!=="string"||base64.length<40000)throw Error("AI 이미지가 비어 있습니다");
  const photo=Buffer.from(base64,"base64");
  const md=await sharp(photo).metadata();
  if(md.width<900||md.height<1000)throw Error("생성한 사진 크기 오류");
  return photo;
}
function positions(index){
  if(index===0)return {photo:{x:0,y:0,w:1080,h:1350},panel:{x:0,y:0,w:760,h:1350},kind:"cover"};
  if(index===1)return {photo:{x:555,y:0,w:525,h:1350},panel:{x:0,y:0,w:555,h:1350},kind:"left"};
  if(index===2)return {photo:{x:0,y:570,w:1080,h:780},panel:{x:0,y:0,w:1080,h:570},kind:"top"};
  if(index===3)return {photo:{x:0,y:0,w:550,h:1350},panel:{x:550,y:0,w:530,h:1350},kind:"right"};
  if(index===4)return {photo:{x:0,y:0,w:1080,h:770},panel:{x:0,y:770,w:1080,h:580},kind:"bottom"};
  return {photo:{x:0,y:0,w:1080,h:1350},panel:{x:70,y:540,w:940,h:700},kind:"closing"};
}
async function makeSlide(channel,index,post,photo,fontData){
  const tone=rgb[channel],design=positions(index),p=design.panel,photoBox=design.photo;
  const slide=post.slides[index];if(!slide)throw Error("6장 슬라이드 정보 없음");
  const photoCrop=await sharp(photo).resize(photoBox.w,photoBox.h,{fit:"cover",position:"attention"}).jpeg({quality:88}).toBuffer();
  const jpegBase=await sharp({create:{width:1080,height:1350,channels:4,background:tone.paper}})
    .composite([{input:photoCrop,left:photoBox.x,top:photoBox.y}]).png().toBuffer();
  const cover=index===0,closing=index===5;
  const panelColor=cover?"rgba(243,240,233,0.91)":closing?"rgba(245,243,239,0.94)":tone.paper;
  const headline=lines(copySafe(slide.title,90),p.w<600?9:13,4);
  const description=lines(copySafe(slide.desc,160),p.w<600?14:28,4);
  const titleSize=Math.min(cover?83:closing?72:77,
    headline.length>52?53:headline.length>35?62:headline.length>26?70:83);
  const top=p.y+(cover?305:closing?205:design.kind==="bottom"?80:design.kind==="top"?132:285);
  const pad=p.w<600?51:73;
  const maxTextWidth=p.w-2*pad;
  const serifSpace=channel==="fashion"?"STYLE / NOTES":"THE SHOP EDIT";
  const masthead=channel==="fashion"?"입는감각":"YOGO EDIT";
  const chapter=index===0?"ISSUE / 01":index===5?"KEEP / SAVE":"NOTE / "+String(index).padStart(2,"0");
  const ov=layer([
    place([],p.x,p.y,p.w,p.h,{backgroundColor:panelColor}),
    place(text(masthead,{fontSize:34,color:tone.ink,letterSpacing:"0.5px"}),p.x+pad,p.y+55,maxTextWidth,60),
    place(layer([], {width:Math.min(maxTextWidth,230),height:2,backgroundColor:tone.accent}),p.x+pad,p.y+122,maxTextWidth,2),
    place(text(chapter,{fontSize:21,color:tone.accent,letterSpacing:"2px"}),p.x+pad,top-74,maxTextWidth,39),
    place(text(headline,{fontSize:titleSize,lineHeight:1.28,color:tone.ink,letterSpacing:"-1.5px"}),p.x+pad,top,maxTextWidth,Math.min(560,Math.max(240,Math.ceil(headline.split("\n").length*titleSize*1.36)))),
    place(text(description,{fontSize:p.w<600?27:34,lineHeight:1.65,color:"#52504D"}),p.x+pad,top+Math.min(450,Math.ceil(headline.split("\n").length*titleSize*1.36))+40,maxTextWidth,270),
    place(layer([
      text(serifSpace,{fontSize:19,color:tone.accent,letterSpacing:"2px"}),
      text(String(index+1).padStart(2,"0")+" / 06",{fontSize:20,color:tone.ink})
    ],{width:maxTextWidth,justifyContent:"space-between",alignItems:"center"}),p.x+pad,p.y+p.h-87,maxTextWidth,46)
  ],{width:1080,height:1350,position:"relative",backgroundColor:"transparent"});
  const svg=await satori(ov,{width:1080,height:1350,fonts:[{name:"Noto",data:fontData,weight:400,style:"normal"}]});
  const out=await sharp(jpegBase).composite([{input:Buffer.from(svg),top:0,left:0}]).jpeg({quality:90,mozjpeg:true}).toBuffer();
  const md=await sharp(out).metadata();
  if(md.width!==1080||md.height!==1350||out.length>4_900_000)throw Error("최종 JPEG 크기 또는 용량 오류");
  return out;
}
async function upload(postId,ownerId,index,jpeg){
  const key=env("SUPABASE_SECRET_KEY")||env("SUPABASE_SERVICE_ROLE_KEY");
  if(!key)throw Error("Supabase 서버 비밀키 없음");
  const filename=ownerId+"/"+postId+"/premium-"+Date.now()+"-"+String(index+1).padStart(2,"0")+".jpg";
  const headers={apikey:key,"Content-Type":"image/jpeg"};
  if(!key.startsWith("sb_secret_"))headers.Authorization="Bearer "+key;
  const response=await fetch(base()+"/storage/v1/object/studio-media/"+filename,{
    method:"POST",headers,body:jpeg,signal:AbortSignal.timeout(22000)});
  if(!response.ok)throw Error("이미지 업로드 실패 "+(index+1)+": "+response.status+" "+(await response.text()).slice(0,90));
  return base()+"/storage/v1/object/public/studio-media/"+filename;
}
export async function renderPremiumPost(post,ownerId){
  if(!["fashion","yogo"].includes(post.channel))throw Error("채널 오류");
  if(!Array.isArray(post.slides)||post.slides.length!==6)throw Error("6장 원고가 완성되지 않았습니다");
  const topic=copySafe(post.title,100);
  // Three independent candid photos. Each is used twice with different art direction.
  const [fontData,photos]=await Promise.all([
    font(),
    Promise.all([0,1,2].map((i)=>imageRequest(post.channel,topic,post.slides[i*2],i)))
  ]);
  const urls=[];
  for(let i=0;i<6;i++){
    const jpeg=await makeSlide(post.channel,i,post,photos[Math.floor(i/2)],fontData);
    urls.push(await upload(post.id,ownerId,i,jpeg));
  }
  if(urls.length!==6||urls.some(x=>!x.startsWith("https://")))throw Error("이미지 6장 생성 미완료");
  return urls;
}
