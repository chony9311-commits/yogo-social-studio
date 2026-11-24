import daily from "./daily.js";
export default function handler(req,res){req.query={...req.query,channel:"fashion"};return daily(req,res)}
