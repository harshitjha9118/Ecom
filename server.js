const express=require("express");
const session=require("express-session");
const bcrypt=require("bcryptjs");
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
 CREATE TABLE IF NOT EXISTS orders(id BIGSERIAL PRIMARY KEY,user_id BIGINT REFERENCES users(id),customer_name VARCHAR(100),phone VARCHAR(30),address TEXT,status VARCHAR(30) DEFAULT 'Placed',total NUMERIC(10,2),items JSONB,created_at TIMESTAMPTZ DEFAULT NOW());`);
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
}
function auth(req,res,next){if(!req.session.userId)return res.status(401).json({error:"Please login first."});next()}
function admin(req,res,next){if(!req.session.isAdmin)return res.status(401).json({error:"Admin login required."});next()}
app.get("/api/products",async(req,res)=>{const r=await q("SELECT id,name,description,price,image,category,stock FROM products WHERE active=true ORDER BY id DESC");res.json(r.rows)});
app.post("/api/register",async(req,res)=>{try{const name=String(req.body.name||"").trim(),email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");if(name.length<2||name.length>100)return res.status(400).json({error:"Name 2–100 characters ka hona chahiye."});if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:"Valid email daalein."});if(password.length<8)return res.status(400).json({error:"Password kam se kam 8 characters ka hona chahiye."});const hash=await bcrypt.hash(password,12);const r=await q("INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email",[name,email,hash]);req.session.userId=r.rows[0].id;res.json({ok:true,user:r.rows[0]})}catch(e){if(e.code==="23505")return res.status(409).json({error:"Email already registered."});console.error(e);res.status(500).json({error:"Server error."})}});
app.post("/api/login",async(req,res)=>{const email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");const r=await q("SELECT id,name,password_hash FROM users WHERE email=$1",[email]);const u=r.rows[0];if(!u||!await bcrypt.compare(password,u.password_hash))return res.status(401).json({error:"Email ya password galat hai."});req.session.userId=u.id;res.json({ok:true,name:u.name})});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",auth,async(req,res)=>{const r=await q("SELECT id,name,email FROM users WHERE id=$1",[req.session.userId]);res.json(r.rows[0]||null)});
app.post("/api/orders",auth,async(req,res)=>{const {items,name,phone,address}=req.body;if(!Array.isArray(items)||!items.length||items.length>30)return res.status(400).json({error:"Cart empty hai."});if(!name||!phone||!address)return res.status(400).json({error:"Delivery details complete karein."});const ids=items.map(x=>Number(x.id));if(ids.some(x=>!Number.isInteger(x)||x<1))return res.status(400).json({error:"Invalid cart."});const client=await pool.connect();try{await client.query("BEGIN");let final=[],total=0;for(const it of items){const r=await client.query("SELECT id,name,price,stock FROM products WHERE id=$1 AND active=true FOR UPDATE",[Number(it.id)]);const p=r.rows[0],qty=Math.max(1,Math.min(20,Number(it.qty)||1));if(!p||p.stock<qty)throw new Error("Product stock available nahi hai.");final.push({id:p.id,name:p.name,price:Number(p.price),qty});total+=Number(p.price)*qty;await client.query("UPDATE products SET stock=stock-$1 WHERE id=$2",[qty,p.id]);}const o=await client.query("INSERT INTO orders(user_id,customer_name,phone,address,total,items) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[req.session.userId,name,phone,address,total,JSON.stringify(final)]);await client.query("COMMIT");res.json({ok:true,orderId:o.rows[0].id,total})}catch(e){await client.query("ROLLBACK");res.status(400).json({error:e.message||"Order place nahi hua."})}finally{client.release()}});
app.post("/api/admin/login",(req,res)=>{if(req.body.username===process.env.ADMIN_USERNAME&&req.body.password===process.env.ADMIN_PASSWORD&&process.env.ADMIN_PASSWORD){req.session.isAdmin=true;return res.json({ok:true})}res.status(401).json({error:"Admin details galat hain."})});
app.get("/api/admin/data",admin,async(req,res)=>{const [u,o,p]=await Promise.all([q("SELECT id,name,email,created_at FROM users ORDER BY id DESC LIMIT 200"),q("SELECT id,customer_name,phone,address,total,status,items,created_at FROM orders ORDER BY id DESC LIMIT 200"),q("SELECT id,name,price,stock,active FROM products ORDER BY id DESC")]);res.json({users:u.rows,orders:o.rows,products:p.rows})});
app.post("/api/admin/products",admin,async(req,res)=>{const {name,description,price,image,category,stock}=req.body;if(!name||!Number.isFinite(Number(price))||Number(price)<=0)return res.status(400).json({error:"Product name aur valid price required."});const r=await q("INSERT INTO products(name,description,price,image,category,stock) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[name,description||"",price,image||"",category||"General",Math.max(0,Number(stock)||0)]);res.json({ok:true,id:r.rows[0].id})});
app.patch("/api/admin/orders/:id",admin,async(req,res)=>{const status=String(req.body.status||"");if(!["Placed","Processing","Shipped","Delivered","Cancelled"].includes(status))return res.status(400).json({error:"Invalid status."});await q("UPDATE orders SET status=$1 WHERE id=$2",[status,req.params.id]);res.json({ok:true})});
app.listen(process.env.PORT||3000,()=>console.log("ShopEase running"));
init().catch(e=>{console.error("DB init error",e);process.exit(1)});