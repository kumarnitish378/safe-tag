# 🏷️ Safe-Tag — Full-Stack Safety Ecosystem

> **"Your loved ones can't always speak. Safe-Tag speaks for them."**

RFID + QR hybrid safety tags for children, elderly, travelers & pets in India.  
One scan → emergency profile → instant reunion.

---

## 🗂️ Project Structure

```
safe-tag/
├── app.py                    # Flask app: models, routes, all logic
├── requirements.txt          # Python dependencies
├── Procfile                  # Gunicorn (Render / Heroku)
├── .env.example              # Environment variables template
├── scripts/
│   └── factory.py            # Batch tag generator (1,000 tags → CSV)
└── templates/
    ├── base.html             # Design system, nav, footer
    ├── index.html            # Landing page
    ├── login.html            # Authentication
    ├── register.html
    ├── dashboard.html        # Tag management
    ├── activate.html         # Serial number entry
    ├── setup_profile.html    # Profile form
    ├── emergency.html        # /v/<slug> — PUBLIC scan page ⚡
    ├── buy.html              # Razorpay purchase flow
    └── not_found.html        # 404 for inactive slugs
```

---

## ⚡ Quick Start (Development)

```bash
# 1. Clone & install
git clone https://github.com/yourname/safe-tag.git
cd safe-tag
pip install -r requirements.txt

# 2. Set up environment
cp .env.example .env
# Edit .env with your values (or leave DATABASE_URL blank to use SQLite at instance/safe_tag_dev.db)

# 3. Initialize database
.venv\Scripts\python.exe -m flask --app app db init
.venv\Scripts\python.exe -m flask --app app db migrate -m "Initial migration"
.venv\Scripts\python.exe -m flask --app app db upgrade

# 4. Create an admin user
.venv\Scripts\python.exe -m flask --app app create-admin

# 5. Run
python app.py
# → http://localhost:5000
```

> Security note: `Flask-WTF` CSRF protection is enabled for all server-side forms, and server-side validation is enforced for registration, login, activation, and profile payloads.

See `docs/PRODUCTION_READINESS.md` for the current production hardening checklist.

---

## 🏭 Factory Script — Batch Generate Tags

```bash
# Generate 1,000 tags (default)
python scripts/factory.py

# Custom count and year
python scripts/factory.py --count 500 --year 2026 --output batch_may.csv
```

**Output CSV columns:**

| serial_number | short_url_slug | public_url | qr_data | rfid_payload |
|---------------|----------------|------------|---------|--------------|
| ST-2026-00001 | xK9p2L         | https://safe-tag.in/v/xK9p2L | https://... | ST-2026-00001 |

Send `public_url` to QR printer. `rfid_payload` goes to RFID chip programmer.

---

## 🗄️ Database Schema

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| email | String(255) | Unique |
| password_hash | String(255) | Werkzeug PBKDF2 |
| mobile_no | String(20) | |
| address | Text | |
| created_at | DateTime | UTC |

### `tags`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| serial_number | String(50) | Unique, e.g. `ST-2026-00042` |
| short_url_slug | String(10) | Unique, e.g. `xK9p2L` |
| is_active | Boolean | False until user activates |
| user_id | FK → users | Null until purchased |
| activated_at | DateTime | Set on profile save |

### `medical_profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | Integer PK | |
| tag_id | FK → tags | One-to-one |
| name | String(150) | |
| blood_group | String(10) | |
| allergies | Text | |
| medication_notes | Text | |
| medical_conditions | Text | |
| emergency_contact_1 | String(20) | Primary phone |
| emergency_contact_2 | String(20) | Backup phone |
| owner_whatsapp | String(20) | For geo alerts |
| privacy_mode | Boolean | Masks phone, requires captcha |
| custom_message | Text | Shown to finder |
| category | String(30) | child/elderly/traveler/pet |

---

## 🛣️ Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Landing page |
| GET/POST | `/register` | Create account |
| GET/POST | `/login` | Login |
| GET | `/logout` | Clear session |
| GET | `/dashboard` | Manage tags (auth required) |
| GET/POST | `/activate` | Enter serial number |
| GET/POST | `/setup-profile/<tag_id>` | Fill medical profile |
| GET | `/buy` | Purchase page |
| POST | `/payment/initiate` | Create Razorpay order |
| POST | `/payment/success` | Confirm payment, assign tags |
| **GET** | **`/v/<slug>`** | **Emergency public profile ⚡** |
| POST | `/api/location-alert` | Receive + forward GPS to owner |
| POST | `/api/reveal-phone/<slug>` | Unmask phone after captcha |

---

## 🔐 Security Design

| Threat | Mitigation |
|--------|-----------|
| Profile enumeration | Random 6-char slug (62^6 = 56B combinations) |
| Phone scraping | Privacy mode: masked by default, captcha gate |
| Slug guessing | Non-sequential, cryptographically random (`secrets` module) |
| Password storage | Werkzeug PBKDF2-SHA256 |
| Session hijack | Flask signed sessions + `SECRET_KEY` |
| CSRF attacks | Flask-WTF CSRF protection enabled for forms |
| SQL injection | SQLAlchemy ORM (parameterized queries) |

---

## 💳 Razorpay Integration

**Mock mode** (default dev): payment simulated with 1.5s delay.

**Production activation:**

1. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env`
2. In `buy.html`, uncomment the Razorpay checkout block
3. In `/payment/success`, verify the Razorpay signature before processing

```python
import razorpay
client = razorpay.Client(auth=(KEY_ID, KEY_SECRET))
client.utility.verify_payment_signature({
    'razorpay_order_id': order_id,
    'razorpay_payment_id': payment_id,
    'razorpay_signature': signature
})
```

---

## 📱 WhatsApp Integration

**Twilio (recommended):**
```python
from twilio.rest import Client
client = Client(TWILIO_SID, TWILIO_AUTH)
client.messages.create(
    from_="whatsapp:+14155238886",
    to=f"whatsapp:{owner_number}",
    body=f"🚨 Safe-Tag Alert!\n{profile.name} was found.\n📍 Location: {maps_url}"
)
```

**Meta Cloud API:**
```python
import requests
requests.post(
    f"https://graph.facebook.com/v17.0/{PHONE_ID}/messages",
    headers={"Authorization": f"Bearer {TOKEN}"},
    json={"messaging_product": "whatsapp", "to": owner_number, "type": "text", "text": {"body": msg}}
)
```

---

## 🚀 Deployment (Render)

1. Push to GitHub
2. New Web Service → Connect repo
3. Build command: `pip install -r requirements.txt`
4. Start command: `gunicorn app:app`
5. Add environment variables (DATABASE_URL, SECRET_KEY, etc.)
6. Add a PostgreSQL database from Render dashboard
7. `DATABASE_URL` is auto-injected

---

## 📊 Business Model

| Pack | Price | COGS (est.) | Margin |
|------|-------|-------------|--------|
| Single Tag | ₹149 | ₹45 | ~70% |
| Family Pack | ₹499 | ₹160 | ~68% |

**Marketing:** Focus on "10-Second Reunion" story. Partner with schools, hospitals, railway stations across India.

---

## 📄 License

MIT © 2026 Safe-Tag India
