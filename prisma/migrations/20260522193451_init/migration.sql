-- CreateTable
CREATE TABLE "tags" (
    "tag_id" TEXT NOT NULL PRIMARY KEY,
    "security_key" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "manufacturer_id" INTEGER,
    "batch_id" INTEGER,
    "owner_id" INTEGER,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" DATETIME,
    "scan_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tags_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tags_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "tags_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "tag_batches" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "medical_profiles" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tag_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "mobile_primary" TEXT NOT NULL,
    "parent_name" TEXT,
    "blood_group" TEXT,
    "address" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "mobile_secondary" TEXT,
    "email" TEXT,
    "medical_conditions" TEXT,
    "allergies" TEXT,
    "medications" TEXT,
    "custom_message" TEXT,
    "owner_whatsapp" TEXT,
    "photo_url" TEXT,
    "category" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "medical_profiles_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags" ("tag_id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "users" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "manufacturers" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "business_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "mobile" TEXT NOT NULL,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "is_blocked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "tag_batches" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "manufacturer_id" INTEGER NOT NULL,
    "batch_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tag_batches_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "product_listings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "manufacturer_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "quantity_available" INTEGER NOT NULL DEFAULT 0,
    "is_approved" BOOLEAN NOT NULL DEFAULT false,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_rejected" BOOLEAN NOT NULL DEFAULT false,
    "photo_url" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_listings_manufacturer_id_fkey" FOREIGN KEY ("manufacturer_id") REFERENCES "manufacturers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "orders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "product_listing_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "tracking_id" TEXT,
    "razorpay_order_id" TEXT,
    "razorpay_payment_id" TEXT,
    "shipping_address" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "orders_product_listing_id_fkey" FOREIGN KEY ("product_listing_id") REFERENCES "product_listings" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "medical_profiles_tag_id_key" ON "medical_profiles"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "manufacturers_email_key" ON "manufacturers"("email");
