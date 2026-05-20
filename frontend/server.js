require("dotenv").config();

const express = require("express");
const session = require("express-session");
const flash = require("connect-flash");
const axios = require("axios");
const path = require("path");

const app = express();
const FLASK_API = process.env.FLASK_API_URL || "http://127.0.0.1:5000";
const PORT = process.env.PORT || 3000;

const api = axios.create({
  baseURL: FLASK_API,
  timeout: 10000,
  headers: {
    "X-CSRF-Token": process.env.SECRET_KEY || "dev-secret-change-me",
  },
});

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.NODE_SESSION_SECRET || "dev-node-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  }),
);
app.use(flash());
app.use((req, res, next) => {
  res.locals.flash = {
    success: req.flash("success"),
    error: req.flash("error"),
    info: req.flash("info"),
  };
  res.locals.user = req.session.user || null;
  res.locals.manufacturer = req.session.manufacturer || null;
  res.locals.admin = req.session.user && req.session.user.is_admin ? req.session.user : null;
  res.locals.flaskApiUrl = FLASK_API;
  next();
});

function headers(req) {
  return req.session.userToken ? { "X-Auth-Token": req.session.userToken } : {};
}

function mfrHeaders(req) {
  return req.session.manufacturerToken ? { "X-Auth-Token": req.session.manufacturerToken } : {};
}

function requireUser(req, res, next) {
  if (!req.session.userToken) {
    req.flash("error", "Please log in first.");
    return res.redirect("/login");
  }
  next();
}

function requireManufacturer(req, res, next) {
  if (!req.session.manufacturerToken) {
    req.flash("error", "Manufacturer login required.");
    return res.redirect("/manufacturer/login");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userToken || !req.session.user || !req.session.user.is_admin) {
    req.flash("error", "Admin access required.");
    return res.redirect("/login");
  }
  next();
}

function apiMessage(error) {
  return error.response?.data?.message || error.message || "Something went wrong.";
}

async function safeGet(url, config = {}) {
  const response = await api.get(url, config);
  return response.data;
}

app.get("/", async (req, res) => {
  let products = [];
  try {
    products = (await safeGet("/api/store/products?featured=true")).products || [];
  } catch {}
  res.render("index", { products });
});

app.get("/store", async (req, res) => {
  const products = (await safeGet("/api/store/products", { params: req.query })).products || [];
  res.render("store", { products });
});

app.get("/store/:product_id", async (req, res) => {
  try {
    const product = (await safeGet(`/api/store/products/${req.params.product_id}`)).product;
    res.render("store_product", { product });
  } catch {
    res.status(404).render("404");
  }
});

app.post("/store/:product_id/buy", requireUser, async (req, res) => {
  try {
    const payload = { product_listing_id: Number(req.params.product_id), quantity: Number(req.body.quantity || 1) };
    await api.post("/api/payment/initiate", payload, { headers: headers(req) });
    const done = await api.post("/api/payment/success", payload, { headers: headers(req) });
    req.flash("success", `Order placed. Order #${done.data.order_id}`);
    res.redirect("/orders");
  } catch (err) {
    req.flash("error", apiMessage(err));
    res.redirect(`/store/${req.params.product_id}`);
  }
});

app.get("/:tag_id/:security_key", async (req, res, next) => {
  if (["store", "login", "register", "dashboard", "orders", "account", "manufacturer", "admin", "qr", "emergency"].includes(req.params.tag_id)) {
    return next();
  }
  try {
    const result = await safeGet(`/api/scan/${req.params.tag_id}/${req.params.security_key}`);
    return res.redirect(result.is_active ? `/emergency/${result.tag_id}` : `/register/${result.tag_id}`);
  } catch {
    return res.status(404).render("404");
  }
});

app.get("/register/:tag_id", async (req, res, next) => {
  if (!/^[A-Z0-9]{8}$/.test(req.params.tag_id)) return next();
  try {
    const status = await safeGet(`/api/tag/${req.params.tag_id}/status`);
    if (status.is_active) return res.redirect(`/emergency/${req.params.tag_id}`);
    res.render("register_tag", { tag_id: req.params.tag_id, values: {}, errors: [] });
  } catch {
    res.status(404).render("404");
  }
});

app.post("/register/:tag_id", async (req, res) => {
  try {
    await api.post(`/api/tag/${req.params.tag_id}/register`, req.body);
    req.flash("success", "SafeTag activated.");
    res.redirect(`/emergency/${req.params.tag_id}`);
  } catch (err) {
    res.status(422).render("register_tag", { tag_id: req.params.tag_id, values: req.body, errors: [apiMessage(err)] });
  }
});

app.get("/emergency/:tag_id", async (req, res) => {
  try {
    const data = await safeGet(`/api/emergency/${req.params.tag_id}`);
    res.render("emergency", { tag: data.tag, profile: data.profile });
  } catch {
    res.status(404).render("404");
  }
});

app.get("/login", (req, res) => res.render("auth/login"));
app.post("/login", async (req, res) => {
  try {
    const response = await api.post("/api/auth/login", req.body);
    req.session.userToken = response.data.token;
    req.session.user = response.data.user;
    req.flash("success", "Logged in.");
    res.redirect(response.data.user.is_admin ? "/admin" : "/dashboard");
  } catch (err) {
    req.flash("error", apiMessage(err));
    res.redirect("/login");
  }
});

app.get("/register", (req, res) => res.render("auth/register"));
app.post("/register", async (req, res) => {
  if (req.body.password !== req.body.confirm_password) {
    req.flash("error", "Passwords do not match.");
    return res.redirect("/register");
  }
  try {
    const response = await api.post("/api/auth/register", req.body);
    req.session.userToken = response.data.token;
    req.session.user = response.data.user;
    req.flash("success", "Account created.");
    res.redirect("/dashboard");
  } catch (err) {
    req.flash("error", apiMessage(err));
    res.redirect("/register");
  }
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

app.get("/dashboard", requireUser, async (req, res) => {
  const tags = (await safeGet("/api/user/tags", { headers: headers(req) })).tags || [];
  res.render("dashboard", { tags });
});

app.get("/profile/edit/:tag_id", requireUser, async (req, res) => {
  try {
    const profile = (await safeGet(`/api/tag/${req.params.tag_id}/profile`, { headers: headers(req) })).profile;
    res.render("profile_edit", { tag_id: req.params.tag_id, profile, errors: [] });
  } catch {
    res.status(404).render("404");
  }
});

app.post("/profile/edit/:tag_id", requireUser, async (req, res) => {
  try {
    await api.put(`/api/tag/${req.params.tag_id}/profile`, req.body, { headers: headers(req) });
    req.flash("success", "Profile updated.");
    res.redirect("/dashboard");
  } catch (err) {
    res.render("profile_edit", { tag_id: req.params.tag_id, profile: req.body, errors: [apiMessage(err)] });
  }
});

app.get("/orders", requireUser, async (req, res) => {
  const orders = (await safeGet("/api/user/orders", { headers: headers(req) })).orders || [];
  res.render("orders", { orders });
});

app.get("/account/settings", requireUser, (req, res) => res.render("account_settings"));
app.post("/account/settings", requireUser, async (req, res) => {
  try {
    await api.put("/api/user/settings", req.body, { headers: headers(req) });
    req.flash("success", "Settings updated.");
  } catch (err) {
    req.flash("error", apiMessage(err));
  }
  res.redirect("/account/settings");
});

app.get("/manufacturer/register", (req, res) => res.render("manufacturer/register"));
app.post("/manufacturer/register", async (req, res) => {
  try {
    await api.post("/api/manufacturer/register", req.body);
    req.flash("success", "Registered. Admin approval required.");
    res.redirect("/manufacturer/login");
  } catch (err) {
    req.flash("error", apiMessage(err));
    res.redirect("/manufacturer/register");
  }
});

app.get("/manufacturer/login", (req, res) => res.render("manufacturer/login"));
app.post("/manufacturer/login", async (req, res) => {
  try {
    const response = await api.post("/api/manufacturer/login", req.body);
    req.session.manufacturerToken = response.data.token;
    req.session.manufacturer = response.data.manufacturer;
    res.redirect("/manufacturer/dashboard");
  } catch (err) {
    req.flash("error", apiMessage(err));
    res.redirect("/manufacturer/login");
  }
});

app.get("/manufacturer/dashboard", requireManufacturer, async (req, res) => {
  const batches = (await safeGet("/api/manufacturer/batches", { headers: mfrHeaders(req) })).batches || [];
  const listings = (await safeGet("/api/manufacturer/listings", { headers: mfrHeaders(req) })).listings || [];
  res.render("manufacturer/dashboard", { batches, listings });
});

app.get("/manufacturer/batch/new", requireManufacturer, (req, res) => res.render("manufacturer/batch_new"));
app.post("/manufacturer/batch/new", requireManufacturer, async (req, res) => {
  try {
    const response = await api.post("/api/manufacturer/batch", { qty: Number(req.body.qty), batch_name: req.body.batch_name }, { headers: mfrHeaders(req), responseType: "stream" });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", response.headers["content-disposition"] || "attachment; filename=batch.csv");
    response.data.pipe(res);
  } catch (err) {
    req.flash("error", apiMessage(err));
    res.redirect("/manufacturer/batch/new");
  }
});

app.get("/manufacturer/batch/:id", requireManufacturer, async (req, res) => {
  const batch = (await safeGet(`/api/manufacturer/batch/${req.params.id}`, { headers: mfrHeaders(req) })).batch;
  res.render("manufacturer/batch_detail", { batch });
});

app.get("/manufacturer/listings", requireManufacturer, async (req, res) => {
  const listings = (await safeGet("/api/manufacturer/listings", { headers: mfrHeaders(req) })).listings || [];
  res.render("manufacturer/listings", { listings });
});

app.get("/manufacturer/listings/new", requireManufacturer, (req, res) => res.render("manufacturer/listing_new"));
app.post("/manufacturer/listings/new", requireManufacturer, async (req, res) => {
  try {
    await api.post("/api/manufacturer/listings", req.body, { headers: mfrHeaders(req) });
    req.flash("success", "Listing submitted for approval.");
    res.redirect("/manufacturer/listings");
  } catch (err) {
    req.flash("error", apiMessage(err));
    res.redirect("/manufacturer/listings/new");
  }
});

app.get("/admin", requireAdmin, async (req, res) => {
  const stats = await safeGet("/api/admin/stats", { headers: headers(req) });
  res.render("admin/dashboard", { stats });
});

app.get("/admin/manufacturers", requireAdmin, async (req, res) => {
  const manufacturers = (await safeGet("/api/admin/manufacturers", { headers: headers(req) })).manufacturers || [];
  res.render("admin/manufacturers", { manufacturers });
});

app.post("/admin/manufacturers/:id/:action", requireAdmin, async (req, res) => {
  await api.post(`/api/admin/manufacturers/${req.params.id}/${req.params.action}`, {}, { headers: headers(req) });
  res.redirect("/admin/manufacturers");
});

app.get("/admin/store", requireAdmin, async (req, res) => {
  const listings = (await safeGet("/api/admin/listings", { headers: headers(req) })).listings || [];
  res.render("admin/store", { listings });
});

app.post("/admin/listings/:id/:action", requireAdmin, async (req, res) => {
  await api.post(`/api/admin/listings/${req.params.id}/${req.params.action}`, req.body, { headers: headers(req) });
  res.redirect("/admin/store");
});

app.get("/admin/users", requireAdmin, async (req, res) => {
  const users = (await safeGet("/api/admin/users", { headers: headers(req) })).users || [];
  res.render("admin/users", { users });
});

app.get("/admin/orders", requireAdmin, async (req, res) => {
  const orders = (await safeGet("/api/admin/orders", { headers: headers(req), params: req.query })).orders || [];
  res.render("admin/orders", { orders });
});

app.post("/admin/orders/:id/dispatch", requireAdmin, async (req, res) => {
  await api.post(`/api/admin/orders/${req.params.id}/dispatch`, req.body, { headers: headers(req) });
  res.redirect("/admin/orders");
});

app.get("/qr/:tag_id", async (req, res) => {
  const response = await api.get(`/api/qr/${req.params.tag_id}`, { responseType: "stream" });
  res.setHeader("Content-Type", "image/png");
  response.data.pipe(res);
});

app.get("/404", (req, res) => res.status(404).render("404"));
app.use((req, res) => res.status(404).render("404"));

app.listen(PORT, () => {
  console.log(`SafeTag frontend running at http://127.0.0.1:${PORT}`);
});
