# ShopEase Ecommerce Website

Mobile-friendly demo ecommerce website.

## Features
- Product listing and shopping cart
- Create account / login with email and password
- Passwords are stored as bcrypt hashes, never as readable text
- Checkout with demo Cash on Delivery flow
- PostgreSQL database for users, products and orders
- Admin dashboard: customers, orders, products; add products and update order status

## Render deployment (Android se bhi kar sakte hain)
1. ZIP extract karein aur GitHub par repository mein files upload karein.
2. Render mein **New + > PostgreSQL** banayein.
3. Render mein **New + > Web Service** se GitHub repo connect karein.
4. Build command: `npm install`
5. Start command: `npm start`
6. Environment Variables add karein:
   - `DATABASE_URL` = Render PostgreSQL ka Internal Database URL
   - `SESSION_SECRET` = lambi random secret value
   - `ADMIN_USERNAME` = apna admin username
   - `ADMIN_PASSWORD` = strong private admin password
   - `NODE_ENV` = `production`
7. Deploy karein. Store home page `/` par aur admin dashboard `/admin.html` par milega.

## Important
- Yeh starter/demo store hai. Real online payments (UPI/cards) ke liye Razorpay/Stripe jaise payment provider ka verified integration alag se karna hoga.
- COD flow abhi demo order create karta hai; courier/shipping integration included nahi.
- Admin ko customer passwords nahi dikhte. Password bcrypt hash mein store hota hai; login usi password ko verify karta hai.
- Public deployment se pehle privacy policy, terms, order notifications, rate limiting, CSRF protections, persistent session store, backups aur production hardening add karein.
