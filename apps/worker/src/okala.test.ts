import { describe, expect, it } from "vitest";
import { collectOkala } from "./okala";

const bff={data:{carousels:{entities:[{id:87001,isMulti:true},{id:5,isMulti:false}]}}};
const nearby={success:true,data:{stores:[{storeId:1,isActive:true,isServes:true,isExist:true},{storeId:2,isActive:false,isServes:true,isExist:true}]}};
const offers={success:true,entities:[{storeId:1,storeName:"فروشگاه",products:[{id:1,name:"مرزی",discountPercent:30,quantity:1,hasQuantity:true,okPrice:700000,price:1000000,storeName:"فروشگاه",storeId:1,imageUrl:null,storeTypeName:"سوپر",storeTypeId:1},{id:1,name:"مرزی",discountPercent:30,quantity:1,hasQuantity:true,okPrice:700000,price:1000000,storeName:"فروشگاه",storeId:1,imageUrl:null,storeTypeName:"سوپر",storeTypeId:1}]}]};
describe("Okala collector",()=>{
  it("uses serviceable stores, includes the 30 boundary, and deduplicates",async()=>{let i=0;const fetcher=async()=>new Response(JSON.stringify([bff,nearby,offers][i++]),{status:200});const result=await collectOkala({latitude:35,longitude:51,threshold:30,token:"token",fetcher:fetcher as typeof fetch});expect(result.vendorCount).toBe(1);expect(result.deals).toHaveLength(1);expect(result.deals[0]?.finalPriceRials).toBe(700000);expect(result.deals[0]?.discountRials).toBe(300000);});
  it("normalizes rejected authentication",async()=>{const fetcher=async()=>new Response("",{status:401});await expect(collectOkala({latitude:35,longitude:51,threshold:30,token:"token",fetcher:fetcher as typeof fetch})).rejects.toMatchObject({code:"AUTH_REJECTED"});});
});
