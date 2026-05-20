# SafeTag Production Readiness

Current architecture follows SDD v3.0:

```text
Browser -> Node.js/Express/EJS -> Flask REST API -> Database
```

## Implemented

- [x] Flask backend under `backend/`
- [x] Flask routes return JSON only
- [x] SQLAlchemy models from SDD Section 3
- [x] API route surface from SDD Section 8B
- [x] Factory tag generator
- [x] Seed data from SDD Section 13
- [x] Express frontend under `frontend/`
- [x] EJS templates for all SDD pages
- [x] Emergency page geolocation script
- [x] Rate limits on scan and location alert APIs
- [x] Dummy payment mode and Razorpay signature verification path

## Remaining Hardening

- [ ] Replace in-memory token store with persistent server-side session/token storage
- [ ] Add production Redis storage for Flask-Limiter
- [ ] Add full form-level CSRF token exchange between Node and Flask if Flask API CSRF enforcement is required in production
- [ ] Configure real Razorpay credentials and set `DUMMY_PAYMENT=false`
- [ ] Configure Twilio WhatsApp credentials
- [ ] Configure Cloudinary upload handling for images
- [ ] Add automated tests around all API routes and critical EJS flows

## Deployment

Backend:

```text
Root: /backend
Build: pip install -r requirements.txt && flask db upgrade
Start: gunicorn app:app --workers 2 --bind 0.0.0.0:$PORT
```

Frontend:

```text
Root: /frontend
Build: npm install
Start: node server.js
```
