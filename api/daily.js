// YOGO Social Studio daily editorial worker — KST 09:00.
// Cron uses CRON_SECRET. Nothing is published from this route.
// Two channel-specific, 6-page JPEG carousels are drafted and optionally scheduled.
// Requires OPENAI_API_KEY; avoids hallucinated prices, promotions, products and testimonials.
import satori from "satori";
import sharp from "sharp";
import {adminConfigured,env,base,supabase,json} from "./studio.js";

const OWNER=()=>env("STUDIO_OWNER_ID");
const KST_DATE=()=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day};
const TOPICS={
  fashion:[
    "날마다 같은 옷 입는 느낌을 줄이는 코디 조합법","니트와 셔츠 레이어링에서 주의할 비율",
    "출근 전 3분 코디 점검법","블랙·그레이·크림 조합 처음 시작하기",
    "편안한 신발로 단정한 룩 완성하기","옷장에 잠든 기본 아이템 다시 입기",
    "오버사이즈 옷을 답답하지 않게 입는 방법","가방 하나로 옷 분위기 바꿔보기",
    "니트 오래 입는 보관 습관","겨울 아우터 이너 조합할 때 체크할 것",
    "잘 맞는 바지 기장 거울로 확인하는 방법","베이지 계열 옷에 포인트 주기",
    "한 벌을 두 가지 분위기로 입기","소재와 두께의 대비를 활용하기",
    "신발·가방·벨트 컬러 맞추는 법","화이트 셔츠를 세련되게 활용하기",
    "옷을 구매하기 전 코디 세 가지 떠올리기","날씨와 장소에 맞는 코디 전환",
    "쇼핑 전에 옷장 사진 찍는 이유","자주 입는 옷을 나만의 유니폼으로 만들기"
  ],
  yogo:[
    "쿠폰이 있는데 더 비싸지는 이유 확인하기","동일 모델명과 옵션의 차이 비교하는 순서",
    "반품 택배비까지 포함해 비교하는 법","여러 개 묶음 제품 단위 가격 계산법",
    "생활용품 사기 전 놓치기 쉬운 사이즈","후기 사진과 상세페이지 사진 비교할 때 주의할 점",
    "배송 날짜와 필요 날짜를 구분하는 법","구독·자동결제 표시 확인하는 습관",
    "생활용품 과잉 구매를 줄이는 질문","리필형 제품을 비교할 때 보는 항목",
    "할인 쿠폰 적용 조건 읽는 순서","온라인 후기의 사용 환경 살펴보기",
    "사이즈표를 내 소지품과 비교하는 법","세트 구성에서 빠진 액세서리 확인하기",
    "전자제품 구매 시 호환성 확인 체크리스트","교환 가능 여부를 상품별로 확인하는 법",
    "식품 구매 시 보관 기간과 용량 비교","장바구니에 하루 보류하면 좋은 물건",
    "구매 후 박스·영수증 보관 체크","선물용 구매 전 배송·포장 조건 살피기"
  ]
};
const FONT_URL="https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Korean/NotoSansCJKkr-Regular.otf";
let fontPromise;
function getFont(){
  if(!fontPromise) fontPromise=(async()=>{
    const r=await fetch(FONT_URL,{signal:AbortSignal.timeout(25000)});
    if(!r.ok)throw new Error("Korean font download failed: "+r.status);
    const b=Buffer.from(await r.arrayBuffer());
    if(b.length<1000000||b.length>26000000)throw new Error("Unexpected font size");
    return b;
  })();
  return fontPromise;
}
function block(children,style={}){
  return {type:"div",props:{style:{display:"flex",boxSizing:"border-box",...style},children}};
}
function txt(content,style={}){
  return block(String(content||""),{fontFamily:"Noto",whiteSpace:"pre-wrap",...style});
}
function clean(s,max){
  return String(s||"").replace(/\u0000/g,"").trim().slice(0,max);
}
function escUrl(u){return encodeURIComponent(u);}
function kstSchedule(day,channel){
  return day+"T"+(channel==="fashion"?"03":"11")+":00:00.000Z"; // 12:00 / 20:00 KST
}
function dailyTopic(channel,day){
  const n=Math.floor(Date.parse(day+"T00:00:00Z")/86400000);
  return TOPICS[channel][((n%TOPICS[channel].length)+TOPICS[channel].length)%TOPICS[channel].length];
}
async function copywriter(channel,topic){
  const key=env("OPENAI_API_KEY");
  if(!key)throw new Error("OPENAI_API_KEY missing: automatic AI writing disabled");
  const system=[
    "You are the editor-in-chief of a Korean social editorial carousel.",
    "Output ONLY JSON with title, hook, caption, slides (exactly 6 {tag,title,desc}).",
    "Each slide title is 8-28 Korean chars, one or two short lines. Description max 64 Korean chars.",
    "Clear useful guidance, genuinely practical, written in warm informal Korean banmal without being salesy.",
    "No unsupported trend/current news statements, numeric discounts, prices, celebrity endorsements, pseudo-experiences or fabricated reviews.",
    "No product brand recommendations, sales links, medical claims, advice to buy urgently, or fake third-party sourcing.",
    "No affiliate links. Do not imply first-hand testing.",
    "Strong first-slide hook, four distinct actionable steps, and final summary/save checklist.",
    "Caption 130-420 Korean chars, at most five relevant hashtags. Avoid deceptive clickbait.",
    "Use a thoughtful magazine voice, not generic AI marketing copy. Independent evergreen advice only.",
    "For fashion: stylish but comfortable everyday coordination. For YOGO: cautious decision-making and consumer literacy.",
    "The theme has already been chosen. Don't deviate from it."
  ].join(" ");
  const request={
    model:env("OPENAI_TEXT_MODEL")||"gpt-4.1-mini",
    temperature:0.65,
    response_format:{type:"json_object"},
    messages:[
      {role:"system",content:system},
      {role:"user",content:"Channel: "+channel+". Theme: "+topic+". Produce 6 different carousel slides. JSON schema: {\"title\":\"\",\"hook\":\"\",\"caption\":\"\",\"slides\":[{\"tag\":\"COVER\",\"title\":\"\",\"desc\":\"\"},{\"tag\":\"01\",\"title\":\"\",\"desc\":\"\"},{\"tag\":\"02\",\"title\":\"\",\"desc\":\"\"},{\"tag\":\"03\",\"title\":\"\",\"desc\":\"\"},{\"tag\":\"04\",\"title\":\"\",\"desc\":\"\"},{\"tag\":\"SAVE\",\"title\":\"\",\"desc\":\"\"}]}"}
    ],
    max_tokens:1800
  };
  const response=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",signal:AbortSignal.timeout(40000),
    headers:{"Content-Type":"application/json",Authorization:"Bearer "+key},
    body:JSON.stringify(request)
  });
  const body=await response.json();
  if(!response.ok)throw new Error("OpenAI draft error "+response.status+": "+String(body.error?.message||"").slice(0,110));
  const raw=body.choices?.[0]?.message?.content;
  let draft;
  try{draft=JSON.parse(raw)}catch{throw new Error("AI returned invalid JSON")}
  if(!Array.isArray(draft.slides)||draft.slides.length!==6)throw new Error("Expected six slides");
  const result={
    title:clean(draft.title,100),hook:clean(draft.hook,120),caption:clean(draft.caption,2050),
    slides:draft.slides.map((s,i)=>({tag:i===0?"COVER":i===5?"SAVE":String(i).padStart(2,"0"),title:clean(s.title,95),desc:clean(s.desc,155)}))
  };
  if(!result.title||!result.hook||result.caption.length<30||result.slides.some(s=>s.title.length<3||s.desc.length<8))throw new Error("AI draft lacks concrete content");
  const all=[result.title,result.hook,result.caption,...result.slides.flatMap(s=>[s.title,s.desc])].join(" ");
  if(/최저가|역대급|무료 증정|한정 수량|반값|오늘만|무조건 구매|의사 추천|전문가 인증|직접 써봤|제가 사용해/.test(all))
    throw new Error("AI draft failed factuality/marketing validation");
  return result;
}
async function jpegSlide(channel,day,index,slide,draft,font){
  const fashion=channel==="fashion";
  const paper=fashion?"#F6F0E7":"#F5F2F6",ink=fashion?"#292623":"#282230";
  const accent=fashion?"#8E684D":"#76567D",faint=fashion?"#DDD1C3":"#DDD1E4";
  const small=fashion?"FASHION NOTE":"SHOP SMARTER";
  const number=String(index+1).padStart(2,"0")+"/06";
  const frame=block([
    // Decorative editorial line and letterforms
    block([txt(fashion?"입는감각":"YOGO EDIT",{fontSize:35,color:ink,fontWeight:400}),
      txt("EDITORIAL   /   "+day.replace(/-/g,"."),{fontSize:19,color:accent,letterSpacing:"2px"})],
    {justifyContent:"space-between",alignItems:"center",width:"100%",borderBottom:"2px solid "+faint,paddingBottom:28}),
    block([
      txt(index===0?"THE EDIT":index===5?"SAVE THIS":"CHAPTER "+String(index).padStart(2,"0"),
        {fontSize:23,color:accent,letterSpacing:"4px"}),
      txt(number,{fontSize:22,color:ink})
    ],{justifyContent:"space-between",marginTop:72,marginBottom:45}),
    block([
      block([], {width:23,height:index===0?135:110,backgroundColor:accent,marginRight:28}),
      txt(slide.title,{fontSize:index===0?93:79,color:ink,lineHeight:1.24,letterSpacing:"-1px",flex:1})
    ],{alignItems:"flex-start",width:"100%",minHeight:350}),
    block([
      txt(slide.desc,{fontSize:39,color:"#575157",lineHeight:1.65,whiteSpace:"pre-wrap"})
    ],{marginTop:24,width:"90%",minHeight:260}),
    block([
      block([
        block([],{width:115,height:115,borderRadius:"100%",border:"7px solid "+accent,opacity:0.56}),
        block([],{width:48,height:48,borderRadius:"100%",backgroundColor:accent,opacity:0.38,marginLeft:18,marginTop:57})
      ],{alignItems:"flex-start"}),
      txt(index===0?"STYLE × LIFE":index===5?"KEEP YOUR NOTES":small,{fontSize:21,letterSpacing:"3px",color:accent})
    ],{justifyContent:"space-between",width:"100%",alignItems:"flex-end",marginTop:"auto"}),
    block([
      txt(fashion?"매일 입는 옷의 감각":"똑똑한 구매 기록",{fontSize:23,color:ink}),
      txt(number,{fontSize:23,color:accent})
    ],{justifyContent:"space-between",width:"100%",paddingTop:28,marginTop:31,borderTop:"2px solid "+faint})
  ],{width:1080,height:1350,display:"flex",flexDirection:"column",padding:"72px 76px",backgroundColor:paper});
  const svg=await satori(frame,{width:1080,height:1350,fonts:[{name:"Noto",data:font,weight:400,style:"normal"}]});
  const b=await sharp(Buffer.from(svg)).jpeg({quality:88,mozjpeg:true}).toBuffer();
  const size=await sharp(b).metadata();
  if(size.width!==1080||size.height!==1350||b.length>4800000)throw new Error("Invalid generated image");
  return b;
}
async function uploadImage(day,postId,owner,channel,n,jpeg){
  const key=env("SUPABASE_SECRET_KEY")||env("SUPABASE_SERVICE_ROLE_KEY");
  const path=owner+"/"+postId+"/"+day+"-"+channel+"-slide-"+String(n+1).padStart(2,"0")+".jpg";
  const headers={"apikey":key,"Content-Type":"image/jpeg","Cache-Control":"max-age=31536000"};
  if(!key.startsWith("sb_secret_"))headers.Authorization="Bearer "+key;
  const r=await fetch(base()+"/storage/v1/object/studio-media/"+path,{
    method:"POST",headers,body:jpeg,signal:AbortSignal.timeout(18000)
  });
  if(!r.ok)throw new Error("Image upload "+(n+1)+" error "+r.status+": "+(await r.text()).slice(0,110));
  return base()+"/storage/v1/object/public/studio-media/"+path;
}
async function generateOne(channel,day,font){
  const owner=OWNER();
  const before=await supabase("/rest/v1/studio_posts?owner_id=eq."+escUrl(owner)+"&channel=eq."+channel+
    "&generation_day=eq."+day+"&auto_generated=eq.true&select=id,status&limit=1",{admin:true});
  if(before.length)return {channel,outcome:"already_exists",id:before[0].id,status:before[0].status};
  const topic=dailyTopic(channel,day),draft=await copywriter(channel,topic);
  const row={
    owner_id:owner,channel,title:draft.title,hook:draft.hook,caption:draft.caption,
    slides:draft.slides,image_urls:[],source_links:[],disclosure_required:false,
    ai_generated:true,verified:false,status:"draft",auto_generated:true,generation_day:day,
    review_notes:"자동 편집: "+topic+" / 가격·광고·브랜드 사실 언급 없음 / 게시 전 이미지 검증"
  };
  let rows;
  try{
    rows=await supabase("/rest/v1/studio_posts?select=*",{admin:true,method:"POST",body:row,
      extraHeaders:{"Prefer":"return=representation"}});
  }catch(e){
    if(Number(e.status)===409)return {channel,outcome:"duplicate_skipped"};
    throw e;
  }
  const post=rows?.[0];if(!post?.id)throw new Error("New draft insert missing id");
  try{
    const urls=[];
    for(let i=0;i<6;i++){
      const image=await jpegSlide(channel,day,i,draft.slides[i],draft,font);
      urls.push(await uploadImage(day,post.id,owner,channel,i,image));
    }
    if(urls.length!==6||urls.some(u=>!u.startsWith("https://")))throw new Error("JPEG validation incomplete");
    // No automatic publishing until separately approved server toggle is enabled.
    const autoPublish=env("AUTO_PUBLISH_ENABLED")==="true" && env("LIVE_PUBLISH_ENABLED")==="true";
    const futureTime=new Date(kstSchedule(day,channel)).getTime();
    const shouldSchedule=autoPublish&&futureTime>Date.now()+3600000;
    const patch={
      image_urls:urls,verified:shouldSchedule,
      status:shouldSchedule?"scheduled":"draft",
      scheduled_at:shouldSchedule?kstSchedule(day,channel):null,
      review_notes:shouldSchedule?"자동 규칙 검수 후 예약됨 · 인간 검수는 생략됨":"자동 이미지 생성 완료 · 게시하려면 운영자 검수가 필요",
      error_message:null
    };
    await supabase("/rest/v1/studio_posts?id=eq."+post.id,{admin:true,method:"PATCH",body:patch});
    return {channel,outcome:shouldSchedule?"scheduled":"draft_ready",id:post.id,images:urls.length};
  }catch(e){
    await supabase("/rest/v1/studio_posts?id=eq."+post.id,{admin:true,method:"PATCH",
      body:{status:"draft",verified:false,error_message:String(e.message).slice(0,330)}}).catch(()=>{});
    throw e;
  }
}
export async function generateToday(channel){
  if(!["fashion","yogo"].includes(channel))throw new Error("Invalid channel");
  if(!adminConfigured())throw new Error("Admin DB configuration missing");
  const font=await getFont();
  return generateOne(channel,KST_DATE(),font);
}
export default async function handler(req,res){
  try{
    if(req.method!=="GET")return json(res,405,{error:"GET only"});
    if(!env("CRON_SECRET")||req.headers.authorization!=="Bearer "+env("CRON_SECRET"))
      return json(res,401,{error:"Unauthorized"});
    if(!adminConfigured())return json(res,503,{error:"Admin DB configuration missing"});
    if(env("AUTO_GENERATION_ENABLED")!=="true")
      return json(res,200,{enabled:false,generated:0,message:"Auto generation disabled by server toggle"});
    if(!env("OPENAI_API_KEY"))return json(res,503,{error:"OPENAI_API_KEY missing"});
    const requested=String(req.query?.channel||"");
    const channels=["fashion","yogo"].includes(requested)?[requested]:["fashion","yogo"];
    const day=KST_DATE(),font=await getFont(),results=[];
    for(const channel of channels){
      try{results.push(await generateOne(channel,day,font))}
      catch(e){results.push({channel,outcome:"failed",reason:String(e.message).slice(0,200)})}
    }
    return json(res,200,{enabled:true,day,results});
  }catch(e){
    return json(res,500,{error:"Daily generation error: "+String(e.message).slice(0,200)});
  }
}