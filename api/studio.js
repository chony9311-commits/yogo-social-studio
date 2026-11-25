// YOGO Social Studio — server-only Supabase/Meta operations.
// All mutations require a valid Supabase user token matching STUDIO_OWNER_ID.
const env = (key) => process.env[key] || "";
const base = () => env("SUPABASE_URL").replace(/\/+$/, "");
const pubKey = () => env("SUPABASE_PUBLISHABLE_KEY") || env("SUPABASE_ANON_KEY");
const secretKey = () => env("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
const configured = () => !!(base() && pubKey() && env("STUDIO_OWNER_ID"));
const adminConfigured = () => configured() && !!secretKey();
const error = (message, status=400) => Object.assign(new Error(message), {status});
const json = (res, status, data) => {
  res.setHeader("Cache-Control","no-store");
  res.setHeader("X-Content-Type-Options","nosniff");
  res.status(status).json(data);
};
const cleanUrl = (u) => /^https:\/\/[^\s]+$/i.test(u || "");
const isUuid = (id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || "");
const channelId = (c) => c === "fashion" ? "INSTAGRAM_FASHION_ID" : "INSTAGRAM_YOGO_ID";
const tokenKey = (c) => c === "fashion" ? "INSTAGRAM_FASHION_TOKEN" : "INSTAGRAM_YOGO_TOKEN";
const metaId = (c) => env(channelId(c)) || env(c === "fashion" ? "FASHION_IG_USER_ID" : "YOGO_IG_USER_ID");
const metaToken = (c) => env(tokenKey(c)) || env(c === "fashion" ? "FASHION_IG_ACCESS_TOKEN" : "YOGO_IG_ACCESS_TOKEN");
// Read-only Instagram Login token check. This runs before any irreversible publish request.
// Never return or log credentials, and never claim a token is valid merely because it is stored.
async function verifyInstagramAccount(channel) {
  const id=metaId(channel),token=metaToken(channel);
  if(!id||!token)return {ok:false,reason:"해당 계정의 Instagram ID 또는 액세스 토큰이 등록되지 않았습니다"};
  if(!/^\d{8,25}$/.test(id))return {ok:false,reason:"Instagram 계정 ID 형식을 확인해 주세요"};
  if(/^\d+$/.test(token.trim())||token.length<40||token.trim()!==token||/[\s"'<>]/.test(token))
    return {ok:false,reason:"Instagram 토큰 형식이 잘못됐습니다. 숫자 계정 ID 대신 Meta에서 발급한 긴 액세스 토큰 원문을 등록해 주세요"};
  try{
    const version=/^v\d+\.\d+$/.test(env("META_GRAPH_VERSION"))?env("META_GRAPH_VERSION"):"v27.0";
    const url=new URL("https://graph.instagram.com/"+version+"/"+encodeURIComponent(id));
    url.searchParams.set("fields","id,username");
    const response=await fetch(url,{headers:{Authorization:"Bearer "+token},signal:AbortSignal.timeout(12500),cache:"no-store"});
    let data={};try{data=await response.json()}catch{}
    const code=Number(data.error?.code)||null;
    if(!response.ok||data.error){
      const reason=code===190||response.status===401
        ?"Instagram 토큰 인증 실패. Meta 개발자 콘솔에서 입는감각 토큰을 재발급한 뒤 Vercel의 INSTAGRAM_FASHION_TOKEN 값을 교체해 주세요"
        :"Meta 계정 조회 실패. Meta 앱의 권한과 계정 연결을 확인해 주세요";
      return {ok:false,reason,httpStatus:response.status,metaErrorCode:code};
    }
    if(String(data.id)!==String(id))return {ok:false,reason:"토큰 소유 계정과 등록된 Instagram 계정 ID가 서로 달라요",accountIdMatch:false};
    return {ok:true,username:String(data.username||"").slice(0,60),accountIdMatch:true};
  }catch(e){
    return {ok:false,reason:e?.name==="TimeoutError"?"Meta API 연결 시간 초과. 게시하지 않았습니다":"Meta 계정 인증 요청 실패. 게시하지 않았습니다"};
  }
}
async function supabase(path, {method="GET", bearer, admin=false, body, contentType="application/json", extraHeaders={}}={}) {
  if(!configured()) throw error("Supabase 관리자 연결이 아직 설정되지 않았습니다",503);
  if(admin && !adminConfigured()) throw error("서버 발행용 비밀키가 아직 등록되지 않았습니다",503);
  const key = admin ? secretKey() : pubKey();
  const headers = {"apikey":key, ...extraHeaders};
  if (bearer) headers.Authorization = "Bearer " + bearer;
  else if (admin && !key.startsWith("sb_secret_")) headers.Authorization = "Bearer " + key;
  if (body!==undefined) headers["Content-Type"] = contentType;
  const resp = await fetch(base()+path,{method,headers,body:body===undefined?undefined:(typeof body==="string" || Buffer.isBuffer(body) ? body : JSON.stringify(body))});
  const raw=await resp.text();
  let data;try{data=JSON.parse(raw)}catch{data=raw}
  if(!resp.ok)throw error("Supabase "+resp.status+": "+(typeof data==="object" ? data.msg || data.message || data.error_description || data.error || "요청 실패" : String(data).slice(0,200)),resp.status);
  return data;
}
async function owner(req) {
  const bearer=(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i)?.[1];
  if(!bearer)throw error("관리자 로그인이 필요합니다",401);
  const user=await supabase("/auth/v1/user",{bearer});
  if(!user?.id || user.id !== env("STUDIO_OWNER_ID"))throw error("관리자 권한 없음",403);
  return {id:user.id,bearer};
}
async function rows(path, bearer, admin=false) {
  const r=await supabase("/rest/v1/"+path,{bearer,admin});
  return Array.isArray(r)?r:[];
}
async function getPost(id,user) {
  if(!isUuid(id))throw error("게시물 ID 오류");
  const list=await rows("studio_posts?id=eq."+id+"&owner_id=eq."+encodeURIComponent(user.id)+"&select=*&limit=1",user.bearer);
  if(!list.length)throw error("게시물을 찾을 수 없습니다",404);
  return list[0];
}
async function updatePost(id,patch,user,filters="") {
  const list=await supabase("/rest/v1/studio_posts?id=eq."+id+"&owner_id=eq."+encodeURIComponent(user.id)+filters+"&select=*",{
    method:"PATCH",bearer:user.bearer,extraHeaders:{"Prefer":"return=representation"},body:patch});
  if(!list?.length)throw error("수정할 수 없거나 상태가 변경되었습니다",409);
  return list[0];
}
const sampleSlides=(c)=> c==="fashion" ? [
  ["COVER","한 끗 차이로\n달라지는 코디","핏과 색을 바꾸는 작은 습관"],
  ["01","상의는 짧게\n하의는 길게","비율에 따라 실루엣이 달라져"],
  ["02","컬러는 세 가지 이하","기본색 두 가지, 포인트색 하나"],
  ["03","신발로 분위기 바꾸기","로퍼와 스니커즈의 차이"],
  ["04","소재를 섞어 입기","니트와 데님을 겹쳐봐"],
  ["SAVE","내일 코디 전에 저장","입는감각 스타일 노트"]
] : [
  ["COVER","결제 전에\n이것부터 확인","필요한 제품을 더 똑똑하게 고르는 법"],
  ["01","사용 장면 떠올리기","얼마나 자주 쓸지부터 생각해"],
  ["02","치수와 옵션 확인","같은 이름도 구성이 다를 수 있어"],
  ["03","배송 조건 살피기","반품·배송비도 구매 기준"],
  ["04","후기는 맥락과 함께","실제 사용 환경이 비슷한지 체크"],
  ["SAVE","사기 전에 다시 보기","YOGO EDIT 쇼핑 체크리스트"]
];
function makeDraft(channel) {
  if(!["fashion","yogo"].includes(channel))throw error("계정을 선택해 주세요");
  return {channel,title:channel==="fashion"?"입는감각 스타일 노트":"구매 전 쇼핑 체크리스트",
    hook:channel==="fashion"?"잘 입는 법은 작은 차이에서":"결제 전에 이건 꼭 확인",
    caption:channel==="fashion"?"옷장에 있는 아이템으로 새롭게 코디해봐\n#입는감각":"필요한 제품을 고를 때 확인해둘 체크리스트\n#YOGOEDIT",
    slides:sampleSlides(channel).map(([tag,title,desc])=>({tag,title,desc})),
    image_urls:[],source_links:[],landing_url:null,disclosure_required:false,
    verified:false,status:"draft",review_notes:"원고 및 이미지 사실관계·권리 확인 필요"};
}
function inspect(post,{requireImages=false}={}) {
  const bad=[];
  if(!["fashion","yogo"].includes(post.channel))bad.push("계정 오류");
  if(!post.title || !post.caption || !Array.isArray(post.slides) || post.slides.length!==6)bad.push("제목·캡션·6장 구성을 완성해 주세요");
  if(!post.verified)bad.push("검수 완료 체크가 필요합니다");
  if(requireImages && (!Array.isArray(post.image_urls) || post.image_urls.length!==6 || post.image_urls.some(x=>!cleanUrl(x))))bad.push("공개 JPEG 이미지 6장을 업로드해 주세요");
  if(post.channel==="yogo" && (post.disclosure_required || post.landing_url) && !cleanUrl(post.landing_url))bad.push("제휴·상품 링크가 포함된 YOGO 글에는 검증된 HTTPS 랜딩 주소가 필요합니다");
  if(post.disclosure_required && !/(광고|제휴|수수료|협찬)/.test(post.caption || ""))bad.push("제휴/광고 고지 문구가 필요합니다");
  return bad;
}
async function generateAi(channel) {
  if(!env("OPENAI_API_KEY"))throw error("AI API 키가 설정되지 않았습니다",503);
  const system="한국어 인스타그램 카드뉴스 에디터. 확인되지 않은 가격, 할인, 후기, 연예인 사용, 상품 인기도, 실사용 체험, 최신 트렌드 사실을 지어내지 말 것. 6장의 짧고 구체적인 에버그린 정보. 사진이나 상품 데이터가 확인되지 않으면 추측하지 말 것.";
  const prompt=channel==="fashion"?"입는감각 패션 매거진: 20~40대 한국인 스타일링과 코디 아이디어":"YOGO EDIT 쇼핑 매거진: 상품 사실을 지어내지 않고 유용한 구매 체크리스트";
  const response=await fetch("https://api.openai.com/v1/chat/completions",{
    method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+env("OPENAI_API_KEY")},
    body:JSON.stringify({model:env("OPENAI_TEXT_MODEL")||"gpt-4.1-mini",response_format:{type:"json_object"},
      messages:[{role:"system",content:system},{role:"user",content:prompt+"를 위한 6장 카드뉴스 초안을 만드세요. 다음 JSON 형식만: {\"title\":\"\",\"hook\":\"\",\"caption\":\"\",\"slides\":[{\"tag\":\"\",\"title\":\"\",\"desc\":\"\"}]}"}]})
  });
  const data=await response.json();
  if(!response.ok)throw error("AI API 오류: "+(data.error?.message||response.status),502);
  let out;try{out=JSON.parse(data.choices[0].message.content)}catch{throw error("AI 결과 형식 오류",502)}
  if(!Array.isArray(out.slides)||out.slides.length!==6)throw error("AI 결과가 6장이 아닙니다",502);
  const clean=s=>String(s||"").slice(0,300);
  return {...makeDraft(channel),title:clean(out.title),hook:clean(out.hook),caption:clean(out.caption).slice(0,2200),
    slides:out.slides.map(x=>({tag:clean(x.tag).slice(0,24),title:clean(x.title),desc:clean(x.desc)}))};
}
function bodyOf(req) {
  if(req.body && typeof req.body==="object")return req.body;
  try{return JSON.parse(req.body||"{}")}catch{throw error("잘못된 JSON 요청")}
}
async function handler(req,res) {
  try{
    if(req.method==="OPTIONS")return json(res,405,{error:"지원하지 않는 요청"});
    const action=String(req.query?.action||"status");
    if(action==="status" && req.method==="GET")return json(res,200,{
      mode:configured()?"connected":"demo",authenticated:false,livePublishEnabled:env("LIVE_PUBLISH_ENABLED")==="true",
      ownerConfigured:!!env("STUDIO_OWNER_ID"),metaReady:{fashion:!!(metaToken("fashion")&&metaId("fashion")),yogo:!!(metaToken("yogo")&&metaId("yogo"))},
      imageRendering:"client-preview",storageReady:configured(),adminPublishingReady:adminConfigured(),manualPublishEnabled:env("MANUAL_PUBLISH_ENABLED")==="true",autoGenerationEnabled:env("AUTO_GENERATION_ENABLED")==="true",autoPublishEnabled:env("AUTO_PUBLISH_ENABLED")==="true"&&env("LIVE_PUBLISH_ENABLED")==="true",autoPhotoEnabled:env("AUTO_PHOTO_ENABLED")==="true",aiReady:!!env("OPENAI_API_KEY")
    });
    if(action==="login" && req.method==="POST"){
      if(!configured())throw error("관리자 DB 연결 설정이 아직 없습니다",503);
      const b=bodyOf(req);if(typeof b.email!=="string"||typeof b.password!=="string")throw error("로그인 정보가 필요합니다");
      const session=await supabase("/auth/v1/token?grant_type=password",{
        method:"POST",body:{email:b.email,password:b.password},extraHeaders:{"X-Client-Info":"yogo-social-studio"}});
      const user=await supabase("/auth/v1/user",{bearer:session.access_token});
      if(user.id!==env("STUDIO_OWNER_ID"))throw error("이 앱의 관리자로 지정되지 않은 계정입니다",403);
      return json(res,200,{access_token:session.access_token,expires_in:session.expires_in,user:{id:user.id,email:user.email}});
    }
    const user=await owner(req);
    if(action==="instagram-check" && req.method==="GET"){
      const accounts={
        fashion:await verifyInstagramAccount("fashion"),
        yogo:await verifyInstagramAccount("yogo")
      };
      return json(res,200,{accounts,readOnly:true,publishingPermissionVerified:false,livePublishEnabled:env("LIVE_PUBLISH_ENABLED")==="true",adminPublishingReady:adminConfigured()});
    }
    if(action==="posts" && req.method==="GET"){
      const list=await rows("studio_posts?select=*&owner_id=eq."+encodeURIComponent(user.id)+"&order=created_at.desc&limit=100",user.bearer);
      return json(res,200,{posts:list});
    }
    if(action==="generate-today" && req.method==="POST"){
      const b=bodyOf(req),channel=b.channel;
      if(!["fashion","yogo"].includes(channel))throw error("잘못된 계정",400);
      if(!env("OPENAI_API_KEY"))throw error("AI 자동 생성용 OPENAI_API_KEY가 없습니다",503);
      const {generateToday}=await import("./daily.js");
      const outcome=await generateToday(channel);
      return json(res,200,{result:outcome});
    }
    if(action==="create" && req.method==="POST"){
      const b=bodyOf(req),channel=b.channel;
      if(!["fashion","yogo"].includes(channel))throw error("잘못된 계정");
      const post=b.ai?await generateAi(channel):makeDraft(channel);
      const inserted=await supabase("/rest/v1/studio_posts?select=*",{method:"POST",bearer:user.bearer,
        extraHeaders:{"Prefer":"return=representation"},body:{...post,owner_id:user.id}});
      return json(res,201,{post:inserted[0]});
    }
    const b=bodyOf(req);
    if(!isUuid(b.id))throw error("게시물 ID를 확인해 주세요");
    const post=await getPost(b.id,user);
    if(action==="edit" && req.method==="POST"){
      if(!["draft","approved"].includes(post.status))throw error("예약·게시 상태의 글은 편집할 수 없습니다",409);
      const allowed=["title","hook","caption","slides","landing_url","source_links","verified","disclosure_required","ai_generated","review_notes"];
      const patch={status:"draft",verified:false};
      for(const k of allowed)if(Object.prototype.hasOwnProperty.call(b,k))patch[k]=b[k];
      if(patch.slides && (!Array.isArray(patch.slides) || patch.slides.length!==6))throw error("카드뉴스는 정확히 6장이어야 합니다");
      if(patch.landing_url && !cleanUrl(patch.landing_url))throw error("HTTPS 랜딩만 허용");
      if(patch.title && String(patch.title).length>140)throw error("제목이 너무 깁니다");
      return json(res,200,{post:await updatePost(post.id,patch,user)});
    }
    if(action==="upload" && req.method==="POST"){
      if(post.status!=="draft")throw error("초안 상태에서만 이미지 업로드 가능",409);
      const n=Number(b.slide);
      if(!Number.isInteger(n)||n<0||n>5)throw error("슬라이드 번호 오류");
      if(typeof b.base64!=="string" || b.base64.length>7000000)throw error("JPEG 5MB 이하만 업로드 가능");
      const image=Buffer.from(b.base64.replace(/^data:image\/jpeg;base64,/,""),"base64");
      if(image.length<1000||image.length>5000000||image[0]!==255||image[1]!==216)throw error("유효한 JPEG 이미지가 아닙니다");
      const path=user.id+"/"+post.id+"/slide-"+(n+1)+"-"+Date.now()+".jpg";
      await supabase("/storage/v1/object/studio-media/"+path,{method:"POST",bearer:user.bearer,body:image,contentType:"image/jpeg"});
      const url=base()+"/storage/v1/object/public/studio-media/"+path;
      const urls=Array.isArray(post.image_urls)?post.image_urls.slice():[];
      urls[n]=url;
      return json(res,200,{post:await updatePost(post.id,{image_urls:urls,verified:false},user),image_url:url});
    }
    if(action==="upload-zip" && req.method==="POST"){
      if(post.status!=="draft")throw error("초안 상태에서만 이미지 업로드할 수 있습니다",409);
      if(typeof b.zip_base64!=="string"||b.zip_base64.length>5600000)throw error("ZIP 파일은 4MB 이하만 지원합니다",413);
      const encoded=b.zip_base64.replace(/^data:(?:application\/(?:zip|x-zip-compressed)|application\/octet-stream);base64,/i,"");
      if(!/^[A-Za-z0-9+/=]+$/.test(encoded))throw error("ZIP base64 형식 오류");
      const binary=Buffer.from(encoded,"base64");
      if(binary.length<4000||binary.length>4000000||binary.subarray(0,2).toString()!=="PK")throw error("4MB 이하의 ZIP 파일을 선택해 주세요",422);
      const {unzipSync}=await import("fflate");
      const sharp=(await import("sharp")).default;
      let contents;try{contents=unzipSync(new Uint8Array(binary))}catch{throw error("ZIP 압축 해제 실패",422)}
      const names=Object.keys(contents).filter(x=>!x.endsWith("/"));
      if(names.length>16)throw error("ZIP에 파일이 너무 많습니다",422);
      const pictures=[];
      for(let i=1;i<=6;i++){
        const file=names.find(x=>x===String(i).padStart(2,"0")+".jpg");
        if(!file)throw error(String(i).padStart(2,"0")+".jpg 파일이 ZIP 안에 없습니다",422);
        const bytes=Buffer.from(contents[file]);
        if(bytes.length<1000||bytes.length>5000000||bytes[0]!==255||bytes[1]!==216)throw error(file+"은 유효한 JPEG가 아닙니다",422);
        const md=await sharp(bytes).metadata();
        if(md.width!==1080||md.height!==1350||md.format!=="jpeg")throw error(file+"의 해상도는 1080×1350이어야 합니다",422);
        pictures.push(bytes);
      }
      const urls=[];
      for(let i=0;i<6;i++){
        const storagePath=user.id+"/"+post.id+"/editorial-"+String(i+1).padStart(2,"0")+"-"+Date.now()+".jpg";
        await supabase("/storage/v1/object/studio-media/"+storagePath,{
          method:"POST",bearer:user.bearer,body:pictures[i],contentType:"image/jpeg"});
        urls.push(base()+"/storage/v1/object/public/studio-media/"+storagePath);
      }
      const updated=await updatePost(post.id,{image_urls:urls,verified:false},user,"&status=eq.draft");
      return json(res,200,{post:updated,images_ready:urls.length});
    }
    if(action==="approve" && req.method==="POST"){
      if(!post.verified)throw error("원고·이미지·출처를 검수 완료로 확인해 주세요",422);
      const errors=inspect(post,{requireImages:true});
      if(errors.length)throw error(errors.join(" / "),422);
      if(post.status!=="draft")throw error("초안만 승인할 수 있습니다",409);
      return json(res,200,{post:await updatePost(post.id,{verified:true,status:"approved"},user)});
    }
    if(action==="schedule" && req.method==="POST"){
      if(post.status!=="approved")throw error("검수 승인 상태가 아닙니다",409);
      const target=new Date(b.scheduled_at);
      if(!Number.isFinite(target.getTime())||target<=new Date())throw error("미래 시간을 선택하세요");
      const allowedHour=post.channel==="fashion"?3:11;
      if(target.getUTCHours()!==allowedHour||target.getUTCMinutes()!==0)throw error("한국시간 패션 12시 / YOGO 20시 정각만 가능");
      const errors=inspect(post,{requireImages:true});if(errors.length)throw error(errors.join(" / "),422);
      return json(res,200,{post:await updatePost(post.id,{status:"scheduled",scheduled_at:target.toISOString()},user)});
    }
    if(action==="premium-render" && req.method==="POST"){
      // Paid, explicitly initiated visual generation. Never auto-publishes.
      if(post.status!=="draft")throw error("고퀄리티 재제작은 초안에서만 가능합니다",409);
      if(b.confirm!=="GENERATE PREMIUM IMAGES")throw error("유료 이미지 생성 확인이 필요합니다",400);
      if(!env("OPENAI_API_KEY"))throw error("OPENAI_API_KEY가 등록되지 않았습니다",503);
      if(!adminConfigured())throw error("Supabase 서버 비밀키가 필요합니다",503);
      if(!Array.isArray(post.slides)||post.slides.length!==6)throw error("6장 원고를 먼저 준비해 주세요",422);
      const {renderPremiumPost}=await import("./premium.js");
      const urls=await renderPremiumPost(post,user.id);
      const updated=await updatePost(post.id,{
        image_urls:urls,verified:false,ai_generated:true,status:"draft",
        review_notes:"매거진형 AI 사진 3장 + 전용 한글 편집 디자인 6장 · 재검수 및 광고 고지 확인 필요"
      },user,"&status=eq.draft");
      return json(res,200,{post:updated,images_ready:urls.length,ai_generated:true});
    }
    if(action==="publish-now" && req.method==="POST"){
      // Explicit owner-initiated irreversible Instagram publication.
      // Scheduling (cron) is independently disabled unless LIVE_PUBLISH_ENABLED=true.
      if(env("MANUAL_PUBLISH_ENABLED")!=="true")throw error("수동 Instagram 게시가 서버에서 잠겨 있습니다",503);
      if(!adminConfigured())throw error("게시용 Supabase 서버 비밀키 설정이 필요합니다",503);
      if(b.confirm!=="PUBLISH TO INSTAGRAM")throw error("게시 확인값 오류");
      if(post.status!=="approved")throw error("검수 승인된 글만 게시할 수 있습니다",409);
      if(!post.verified)throw error("이미지와 문구를 먼저 검수해 주세요",422);
      const issues=inspect(post,{requireImages:true});if(issues.length)throw error(issues.join(" / "),422);
      const tokenReady=!!(metaId(post.channel)&&metaToken(post.channel));
      if(!tokenReady)throw error("선택한 인스타 계정의 토큰 또는 ID가 없습니다",503);
      const check=await verifyInstagramAccount(post.channel);
      if(!check.ok)throw error("게시 전 Instagram 연결 확인 실패: "+check.reason,422);
      const claimed=await updatePost(post.id,{status:"publishing",error_message:null},user,"&status=eq.approved");
      try{
        // Dynamic import prevents cron from being run on ordinary editor requests.
        const {publishCarousel}=await import("./cron.js");
        const mediaId=await publishCarousel({...post,status:"publishing"});
        const saved=await updatePost(post.id,{status:"published",published_at:new Date().toISOString(),published_media_id:mediaId,error_message:null},user,"&status=eq.publishing");
        await supabase("/rest/v1/studio_publish_log",{admin:true,method:"POST",body:{post_id:post.id,result:"published",detail:"Owner confirmed manual Instagram publication",meta_media_id:mediaId}}).catch(()=>{});
        return json(res,200,{post:saved,published_media_id:mediaId,channel:post.channel});
      }catch(err){
        // Do NOT retry automatically: Meta may have accepted the publication before a network error.
        await updatePost(post.id,{status:"failed",error_message:String(err.message).slice(0,340)},user,"&status=eq.publishing").catch(()=>{});
        await supabase("/rest/v1/studio_publish_log",{admin:true,method:"POST",body:{post_id:post.id,result:"uncertain",detail:String(err.message).slice(0,600)}}).catch(()=>{});
        throw error("게시 결과 확인 필요(자동 재시도 금지): "+String(err.message).slice(0,250),502);
      }
    }
    if(action==="unschedule" && req.method==="POST"){
      if(!["approved","scheduled"].includes(post.status))throw error("예약 취소 대상이 아닙니다",409);
      return json(res,200,{post:await updatePost(post.id,{status:"draft",scheduled_at:null,verified:false},user)});
    }
    throw error("지원하지 않는 요청",405);
  }catch(e){const status=Number(e.status)||500;json(res,status,{error:status>=500?"서버 설정 또는 연동 오류: "+e.message:e.message})}
}
export default handler;
export {configured,adminConfigured,env,base,supabase,inspect,metaToken,metaId,rows,error,json};
