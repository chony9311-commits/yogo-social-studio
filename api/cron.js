import {configured,adminConfigured,env,base,supabase,inspect,metaToken,metaId,json} from "./studio.js";
const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const version = () => /^v\d+\.\d+$/.test(env("META_GRAPH_VERSION"))? env("META_GRAPH_VERSION") : "v27.0";
async function graph(method,path,token,params={}) {
  const url=new URL("https://graph.instagram.com/"+version()+"/"+path);
  const headers={Authorization:"Bearer "+token};
  const form=new URLSearchParams();
  for(const [k,v] of Object.entries(params))form.set(k,String(v));
  const resp=await fetch(method==="GET" ? url+"?"+form.toString():url,{
    method,headers:method==="GET"?headers:{...headers,"Content-Type":"application/x-www-form-urlencoded"},
    body:method==="GET"?undefined:form});
  const data=await resp.json();
  if(!resp.ok||data.error)throw new Error("Meta "+resp.status+": "+(data.error?.message||"API 요청 실패").slice(0,180));
  return data;
}
export async function publishCarousel(post){
  const accountId=metaId(post.channel),token=metaToken(post.channel);
  if(!accountId||!token)throw new Error("해당 Instagram 계정 토큰이 서버에 등록되지 않았습니다");
  const issues=inspect(post,{requireImages:true});if(issues.length)throw new Error(issues.join(" / "));
  // Upload containers for public JPEG URLs. Do not retry a previously failed publication automatically.
  const children=[];
  for(const url of post.image_urls) {
    const d=await graph("POST",accountId+"/media",token,{image_url:url,is_carousel_item:"true"});
    if(!d.id)throw new Error("Meta child container not returned");
    children.push(d.id);
  }
  // Wait for all JPEG child media to finish processing before composing the carousel.
  // Do not create a parent until every child has returned FINISHED.
  for(const child of children){
    let ready=false;
    for(let n=0;n<18;n++){
      const st=await graph("GET",child,token,{fields:"status_code"});
      if(st.status_code==="FINISHED"){ready=true;break}
      if(["ERROR","EXPIRED"].includes(st.status_code))throw new Error("Meta child processing: "+st.status_code);
      await sleep(1200);
    }
    if(!ready)throw new Error("Meta child processing timeout; inspect Instagram before retry");
  }
  const parent=await graph("POST",accountId+"/media",token,{media_type:"CAROUSEL",children:children.join(","),caption:post.caption,...(post.ai_generated?{is_ai_generated:"true"}:{})});
  for(let n=0;n<12;n++){
    const status=await graph("GET",parent.id,token,{fields:"status_code"});
    if(status.status_code==="FINISHED")break;
    if(["ERROR","EXPIRED"].includes(status.status_code))throw new Error("Meta media processing: "+status.status_code);
    if(n===11)throw new Error("Meta media processing timeout; check status manually");
    await sleep(2200);
  }
  // After this point an exception could mean publication succeeded. Never automatically retry.
  const published=await graph("POST",accountId+"/media_publish",token,{creation_id:parent.id});
  if(!published.id)throw new Error("Meta publication ID absent; check Instagram before retry");
  return published.id;
}
async function patch(id,owner,fromStatus,changes) {
  const resp=await supabase("/rest/v1/studio_posts?id=eq."+id+"&owner_id=eq."+owner+"&status=eq."+fromStatus+"&select=*",{
    method:"PATCH",admin:true,body:changes,extraHeaders:{"Prefer":"return=representation"}});
  return Array.isArray(resp)?resp[0]:null;
}
async function log(postId,result,detail="",meta_media_id=null){
  await supabase("/rest/v1/studio_publish_log",{method:"POST",admin:true,body:{post_id:postId,result,detail:String(detail).slice(0,700),meta_media_id}});
}
export default async function handler(req,res){
  try{
    if(req.method!=="GET")return json(res,405,{error:"GET only"});
    if(!env("CRON_SECRET") || req.headers.authorization!=="Bearer "+env("CRON_SECRET"))return json(res,401,{error:"Cron authorization failed"});
    if(!adminConfigured())return json(res,503,{error:"Studio publishing admin configuration incomplete"});
    if(env("LIVE_PUBLISH_ENABLED")!=="true")return json(res,200,{enabled:false,published:0,message:"실게시 기능 OFF — 아무것도 발행하지 않음"});
    const now=new Date().toISOString();
    const params="studio_posts?select=*&owner_id=eq."+encodeURIComponent(env("STUDIO_OWNER_ID"))+"&status=eq.scheduled&scheduled_at=lte."+encodeURIComponent(now)+"&order=scheduled_at.asc&limit=10";
    const items=await supabase("/rest/v1/"+params,{admin:true});
    const results=[];
    for(const post of items){
      let claimed=false;let afterPublish=false;
      try{
        if(inspect(post,{requireImages:true}).length)throw new Error("검수 조건 미달");
        const taken=await patch(post.id,env("STUDIO_OWNER_ID"),"scheduled",{status:"publishing"});
        if(!taken){results.push({id:post.id,outcome:"already claimed"});continue}
        claimed=true;
        await log(post.id,"claimed","cron selected");
        afterPublish=true;
        const mediaId=await publishCarousel(post);
        await patch(post.id,env("STUDIO_OWNER_ID"),"publishing",{status:"published",published_at:new Date().toISOString(),published_media_id:mediaId,error_message:null});
        await log(post.id,"published","Media published",mediaId);
        results.push({id:post.id,outcome:"published",media_id:mediaId});
      }catch(err){
        // Note: no blind retries, especially after media_publish was attempted.
        if(claimed){
          const state=afterPublish?"uncertain":"failed";
          await patch(post.id,env("STUDIO_OWNER_ID"),"publishing",{status:"failed",error_message:String(err.message).slice(0,350)}).catch(()=>{});
          await log(post.id,state,String(err.message)).catch(()=>{});
        }
        results.push({id:post.id,outcome:"failed",message:String(err.message).slice(0,120)});
      }
    }
    return json(res,200,{enabled:true,checked:items.length,results});
  }catch(e){return json(res,500,{error:"Cron 오류: "+e.message})}
}