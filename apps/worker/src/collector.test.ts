import { describe, expect, it } from "vitest";
import { collectDeals } from "./collector";

const product=(ratio:number,id=1)=>({productVariationId:id,price:100_000,discountRatio:ratio,title:`کالا ${id}`,discount:ratio*1000,image:null,vendorCode:"v",vendorId:10,vendorTitle:"فروشگاه",menu_category_title:"خوراکی",stock:2,is_out_of_stock:false});
const response=(vendors:unknown[],total_count=vendors.length)=>new Response(JSON.stringify({status:true,data:{total_count,vendors}}),{status:200,headers:{"content-type":"application/json"}});
const input={latitude:35,longitude:51,threshold:40,token:"secret",udid:"device",appVersion:"1.0.0"};

describe("SnappMarket collector",()=>{
  it("includes the 40 percent boundary and deduplicates products",async()=>{const fetcher=async()=>response([{vendor_id:10,products:[product(39,1),product(40,2),product(41,3),product(41,3)]}]);const result=await collectDeals({...input,fetcher:fetcher as typeof fetch});expect(result.productCount).toBe(3);expect(result.deals.map(d=>d.discountRatio)).toEqual([40,41]);expect(result.deals[0]?.finalPriceRials).toBe(60_000)});
  it("collects subsequent vendor pages",async()=>{let call=0;const fetcher=async()=>call++===0?response([{vendor_id:10,products:[product(40)]}],2):response([{vendor_id:20,products:[{...product(50,2),vendorId:20}]}],2);const result=await collectDeals({...input,fetcher:fetcher as typeof fetch});expect(result.vendorCount).toBe(2);expect(result.deals).toHaveLength(2)});
  it("rejects repeated pages rather than saving partial data",async()=>{const fetcher=async()=>response([{vendor_id:10,products:[product(40)]}],2);await expect(collectDeals({...input,fetcher:fetcher as typeof fetch})).rejects.toMatchObject({code:"INCOMPLETE_PAGINATION"})});
  it("normalizes authentication rejection",async()=>{const fetcher=async()=>new Response("",{status:401});await expect(collectDeals({...input,fetcher:fetcher as typeof fetch})).rejects.toMatchObject({code:"AUTH_REJECTED"})});
});
