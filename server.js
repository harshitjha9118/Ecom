const express=require("express");
const session=require("express-session");
const bcrypt=require("bcryptjs");
const { Resend } = require("resend");
const crypto=require("crypto");
const {Pool}=require("pg");
const app=express();
app.set('trust proxy', 1);
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes("localhost")?false:{rejectUnauthorized:false}});
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(session({name:"shopease_sid",secret:process.env.SESSION_SECRET||"dev-secret-change-me",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*60*60*1000}}));
app.use(express.static("public"));
const q=(s,p=[])=>pool.query(s,p);
async function init(){
 await q(`CREATE TABLE IF NOT EXISTS users(id BIGSERIAL PRIMARY KEY,name VARCHAR(100) NOT NULL,email VARCHAR(180) UNIQUE NOT NULL,password_hash TEXT NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS products(id BIGSERIAL PRIMARY KEY,name VARCHAR(140) NOT NULL,description TEXT DEFAULT '',price NUMERIC(10,2) NOT NULL,image TEXT DEFAULT '',category VARCHAR(80) DEFAULT 'General',stock INT DEFAULT 20,active BOOLEAN DEFAULT TRUE,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS orders(id BIGSERIAL PRIMARY KEY,user_id BIGINT REFERENCES users(id),customer_name VARCHAR(100),phone VARCHAR(30),address TEXT,status VARCHAR(30) DEFAULT 'Placed',total NUMERIC(10,2),items JSONB,created_at TIMESTAMPTZ DEFAULT NOW());
 CREATE TABLE IF NOT EXISTS password_resets(id BIGSERIAL PRIMARY KEY,email VARCHAR(180) NOT NULL,otp_hash TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ DEFAULT NOW());
 ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_request VARCHAR(30) DEFAULT NULL;
 ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_request_note TEXT DEFAULT '';
 ALTER TABLE orders ADD COLUMN IF NOT EXISTS request_status VARCHAR(30) DEFAULT NULL;
 ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
 ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ DEFAULT NULL;`);
 const c=await q("SELECT COUNT(*)::int AS n FROM products");
 if(c.rows[0].n===0){
  const sample=[
   ["Everyday Backpack","Lightweight everyday backpack with multiple pockets.",1299,"https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=700","Accessories",30],
   ["Wireless Headphones","Comfortable wireless headphones for daily listening.",1999,"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=700","Electronics",25],
   ["Classic Sneakers","Minimal everyday sneakers with a clean design.",2499,"https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=700","Fashion",18],
   ["Smart Watch","Modern smartwatch with a bright display.",3299,"https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=700","Electronics",15],
   ["Ceramic Coffee Mug","A simple ceramic mug for your daily coffee.",399,"https://images.unsplash.com/photo-1514228742587-6b1558f687a0?w=700","Home",40],
   ["Desk Lamp","Warm LED desk lamp for your workspace.",899,"https://images.unsplash.com/photo-150공","Home",12]
  ];
  for(const p of sample.slice(0,5)) await q("INSERT INTO products(name,description,price,image,category,stock) VALUES($1,$2,$3,$4,$5,$6)",p);
 }
 const toys=[
  ["Remote Control Racing Car 1:16","Rechargeable RC racing car with remote control.",1299,"https://images.unsplash.com/photo-1594787318286-3d835c1d207f?w=700","Remote Control Cars",18],
  ["Off-Road Remote Control Monster Truck","All-terrain RC monster truck for indoor and outdoor play.",1899,"https://images.unsplash.com/photo-1594787318286-3d835c1d207f?w=700","Remote Control Cars",12],
  ["Mini RC Drift Sports Car","Compact remote-control sports car with drift-style design.",999,"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700","Remote Control Cars",20],
  ["Building Blocks Creative Set","Colorful building blocks for creative construction play.",699,"https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=700","Building Toys",25],
  ["Dinosaur Figure Play Set","Dinosaur figures for imaginative adventure play.",549,"https://images.unsplash.com/photo-1594787318286-3d835c1d207f?w=700","Action Figures",20],
  ["Kids Pull-Back Toy Car Set","Set of pull-back toy cars for racing fun.",399,"https://images.unsplash.com/photo-1594787318286-3d835c1d207f?w=700","Toy Cars",30],
  ["Remote Control Stunt Car","360-degree stunt-style remote control toy car.",1499,"https://images.unsplash.com/photo-1594787318286-3d835c1d207f?w=700","Remote Control Cars",14],
  ["Soft Teddy Bear","Soft plush teddy bear for kids and gifting.",499,"https://images.unsplash.com/photo-1559454403-b8fb88521f11?w=700","Soft Toys",22],
  ["Kids Doctor Play Kit","Pretend-play doctor kit with toy accessories.",599,"https://images.unsplash.com/photo-1560961911-ba7ef651a56c?w=700","Pretend Play",16],
  ["Toy Construction Truck","Colorful construction truck toy for pretend play.",449,"https://images.unsplash.com/photo-1594787318286-3d835c1d207f?w=700","Toy Vehicles",24],
  ["Remote Control Helicopter Mini","Beginner-friendly mini remote control helicopter toy.",2199,"https://images.unsplash.com/photo-1473968512647-3e447244af8f?w=700","Remote Control Toys",8],
  ["Magnetic Drawing Board","Reusable magnetic drawing board for kids.",349,"https://images.unsplash.com/photo-1513475382585-d06e58bcb0e0?w=700","Learning Toys",20]
 ];
 for (const p of toys) {
  await q("INSERT INTO products(name,description,price,image,category,stock) SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS (SELECT 1 FROM products WHERE name=$7::varchar(140))", [...p, p[0]]);
 }
}
function auth(req,res,next){if(!req.session.userId)return res.status(401).json({error:"Please login first."});next()}
function admin(req,res,next){if(!req.session.isAdmin)return res.status(401).json({error:"Admin login required."});next()}
app.get("/api/products",async(req,res)=>{const r=await q("SELECT id,name,description,price,image,category,stock FROM products WHERE active=true ORDER BY id DESC");res.json(r.rows)});
app.post("/api/register",async(req,res)=>{try{const name=String(req.body.name||"").trim(),email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");if(name.length<2||name.length>100)return res.status(400).json({error:"Name 2–100 characters ka hona chahiye."});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Valid email daalein."});if(password.length<8)return res.status(400).json({error:"Password kam se kam 8 characters ka hona chahiye."});const hash=await bcrypt.hash(password,12);const r=await q("INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email",[name,email,hash]);req.session.userId=r.rows[0].id;res.json({ok:true,user:r.rows[0]})}catch(e){if(e.code==="23505")return res.status(409).json({error:"Email already registered."});console.error(e);res.status(500).json({error:"Server error."})}});
app.post("/api/login",async(req,res)=>{const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");const r=await q("SELECT id,name,password_hash FROM users WHERE email=$1",[email]);const u=r.rows[0];if(!u||!await bcrypt.compare(password,u.password_hash))return res.status(401).json({error:"Email ya password galat hai."});req.session.userId=u.id;const full=await q("SELECT id,name,email FROM users WHERE id=$1",[u.id]);res.json({ok:true,user:full.rows[0],name:u.name})});

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
app.post("/api/forgot-password",async(req,res)=>{
 const email=String(req.body.email||"").trim().toLowerCase();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Valid email address daalein."});
 if(!resend)return res.status(503).json({error:"RESEND_API_KEY Render Environment mein set nahi hai."});
 try{
  const user=await q("SELECT id FROM users WHERE email=$1",[email]);
  if(user.rows.length){
   const otp=String(crypto.randomInt(100000,1000000)),hash=await bcrypt.hash(otp,10);
   await q("DELETE FROM password_resets WHERE email=$1",[email]);
   await q("INSERT INTO password_resets(email,otp_hash,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')",[email,hash]);
   const { data, error } = await resend.emails.send({
    from: process.env.MAIL_FROM || "ShopEase <onboarding@resend.dev>",
    to: [email],
    subject: "ShopEase password reset code",
    text: `Your ShopEase password reset code is ${otp}. It expires in 10 minutes. If you did not request this, ignore this email.`
   });
   if (error) { console.error("Resend API error:", error); return res.status(502).json({error:"Resend email error: "+(error.message||"Request rejected")}); }
   console.log("Password reset email accepted by Resend:", data?.id);
  }
  res.json({ok:true,message:"Agar is email se account registered hai, reset code email par bhej diya gaya hai."});
 }catch(e){console.error("Forgot password email error:",e);res.status(500).json({error:"Email bhejne mein dikkat aayi. Thodi der baad try karein."})}
});
app.post("/api/reset-password",async(req,res)=>{
 const email=String(req.body.email||"").trim().toLowerCase(),otp=String(req.body.otp||"").trim(),password=String(req.body.password||"");
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^\d{6}$/.test(otp))return res.status(400).json({error:"Email aur 6-digit code check karein."});
 if(password.length<8)return res.status(400).json({error:"Naya password kam se kam 8 characters ka hona chahiye."});
 try{
  const r=await q("SELECT id,otp_hash FROM password_resets WHERE email=$1 AND expires_at>NOW() ORDER BY created_at DESC LIMIT 1",[email]);
  if(!r.rows[0]||!await bcrypt.compare(otp,r.rows[0].otp_hash))return res.status(400).json({error:"Reset code galat ya expire ho gaya hai."});
  const hash=await bcrypt.hash(password,12);
  await q("UPDATE users SET password_hash=$1 WHERE email=$2",[hash,email]);
  await q("DELETE FROM password_resets WHERE email=$1",[email]);
  res.json({ok:true,message:"Password reset ho gaya. Ab naye password se login karein."});
 }catch(e){console.error(e);res.status(500).json({error:"Password reset nahi ho paaya."})}
});

app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",auth,async(req,res)=>{const r=await q("SELECT id,name,email FROM users WHERE id=$1",[req.session.userId]);res.json(r.rows[0]||null)});
app.patch("/api/profile",auth,async(req,res)=>{try{const name=String(req.body.name||"").trim(),email=String(req.body.email||"").trim().toLowerCase(),currentPassword=String(req.body.currentPassword||"");if(name.length<2||name.length>100)return res.status(400).json({error:"Name 2–100 characters ka hona chahiye."});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Valid email daalein."});if(!currentPassword)return res.status(400).json({error:"Changes confirm karne ke liye current password daalein."});const u=await q("SELECT password_hash FROM users WHERE id=$1",[req.session.userId]);if(!u.rows[0]||!await bcrypt.compare(currentPassword,u.rows[0].password_hash))return res.status(401).json({error:"Current password galat hai."});const r=await q("UPDATE users SET name=$1,email=$2 WHERE id=$3 RETURNING id,name,email",[name,email,req.session.userId]);res.json({ok:true,user:r.rows[0]})}catch(e){if(e.code==="23505")return res.status(409).json({error:"Ye email kisi aur account par registered hai."});console.error(e);res.status(500).json({error:"Profile update nahi ho paaya."})}});
app.get("/api/my-orders",auth,async(req,res)=>{const r=await q("SELECT id,customer_name,phone,address,total,status,items,created_at,delivered_at,customer_request,customer_request_note,request_status FROM orders WHERE user_id=$1 ORDER BY created_at DESC",[req.session.userId]);res.json({orders:r.rows})});
app.post("/api/my-orders/:id/request",auth,async(req,res)=>{const type=String(req.body.type||""),note=String(req.body.note||"").trim().slice(0,500);if(!["Cancel","Return"].includes(type))return res.status(400).json({error:"Invalid request."});const r=await q("SELECT id,status,created_at,delivered_at FROM orders WHERE id=$1 AND user_id=$2",[req.params.id,req.session.userId]);const o=r.rows[0];if(!o)return res.status(404).json({error:"Order nahi mila."});if(type==="Cancel"&&! ["Placed","Processing"].includes(o.status))return res.status(400).json({error:"Shipped ya delivered order cancel nahi ho sakta. Return request karein."});if(type==="Return"&&(o.status!=="Delivered"||!o.delivered_at||Date.now()-new Date(o.delivered_at).getTime()>7*86400000))return res.status(400).json({error:"Return sirf delivery ke 7 din ke andar request kar sakte hain."});await q("UPDATE orders SET customer_request=$1,customer_request_note=$2,request_status='Pending',updated_at=NOW() WHERE id=$3",[type,note,o.id]);res.json({ok:true,message:type+" request submit ho gayi."})});
app.post("/api/orders",auth,async(req,res)=>{const {items,name,phone,address}=req.body;if(!Array.isArray(items)||!items.length||items.length>30)return res.status(400).json({error:"Cart empty hai."});if(!name||!phone||!address)return res.status(400).json({error:"Delivery details complete karein."});const ids=items.map(x=>Number(x.id));if(ids.some(x=>!Number.isInteger(x)||x<1))return res.status(400).json({error:"Invalid cart."});const client=await pool.connect();try{await client.query("BEGIN");let final=[],total=0;for(const it of items){const r=await client.query("SELECT id,name,price,stock FROM products WHERE id=$1 AND active=true FOR UPDATE",[Number(it.id)]);const p=r.rows[0],qty=Math.max(1,Math.min(20,Number(it.qty)||1));if(!p||p.stock<qty)throw new Error("Product stock available nahi hai.");final.push({id:p.id,name:p.name,price:Number(p.price),qty});total+=Number(p.price)*qty;await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2",[qty,p.id]);}const o=await client.query("INSERT INTO orders(user_id,customer_name,phone,address,total,items) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[req.session.userId,name,phone,address,total,JSON.stringify(final)]);await client.query("COMMIT");res.json({ok:true,orderId:o.rows[0].id,total})}catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message||"Order place nahi hua."})}finally{client.release()}});
app.post("/api/admin/login",(req,res)=>{if(req.body.username===process.env.ADMIN_USERNAME&&req.body.password===process.env.ADMIN_PASSWORD&&process.env.ADMIN_PASSWORD){req.session.isAdmin=true;return res.json({ok:true})}res.status(401).json({error:"Admin details galat hain."})});
app.get("/api/admin/data",admin,async(req,res)=>{const [u,o,p]=await Promise.all([q("SELECT id,name,email,created_at FROM users ORDER BY id DESC LIMIT 200"),q("SELECT id,customer_name,phone,address,total,status,items,created_at,customer_request,customer_request_note,request_status FROM orders ORDER BY id DESC LIMIT 200"),q("SELECT id,name,price,stock,active FROM products ORDER BY id DESC")]);res.json({users:u.rows,orders:o.rows,products:p.rows})});
app.post("/api/admin/products",admin,async(req,res)=>{const {name,description,price,image,category,stock}=req.body;if(!name||!Number.isFinite(Number(price))||Number(price)<=0)return res.status(400).json({error:"Product name aur valid price required."});const r=await q("INSERT INTO products(name,description,price,image,category,stock) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[name,description||"",price,image||"",category||"General",Math.max(0,Number(stock)||0)]);res.json({ok:true,id:r.rows[0].id})});
app.patch("/api/admin/orders/:id",admin,async(req,res)=>{const status=String(req.body.status||"");if(!["Placed","Processing","Shipped","Delivered","Cancelled","Return Approved","Return Rejected"].includes(status))return res.status(400).json({error:"Invalid status."});await q("UPDATE orders SET status=$1,delivered_at=CASE WHEN $1='Delivered' THEN COALESCE(delivered_at,NOW()) ELSE delivered_at END,request_status=CASE WHEN $1 IN ('Cancelled','Return Approved','Return Rejected') THEN $1 ELSE request_status END,updated_at=NOW() WHERE id=$2",[status,req.params.id]);res.json({ok:true})});
app.listen(process.env.PORT||3000,()=>console.log("ShopEase running"));
init().catch(e=>{console.error("DB init error",e);process.exit(1)});