-- CreateEnum
CREATE TYPE "BodyType" AS ENUM ('COMPACT_SUV', 'COUPE', 'CROSSOVER', 'HATCHBACK', 'SEDAN', 'SUV');

-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('COMPACT', 'LUXURY', 'MID_SIZE', 'PREMIUM');

-- CreateEnum
CREATE TYPE "ChargingType" AS ENUM ('AC', 'DC');

-- CreateTable
CREATE TABLE "Manufacturer" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Manufacturer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleModel" (
    "id" SERIAL NOT NULL,
    "manufacturerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "bodyType" "BodyType" NOT NULL,
    "segment" "Segment" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VehicleVariant" (
    "id" SERIAL NOT NULL,
    "modelId" INTEGER NOT NULL,
    "batteryKwh" INTEGER NOT NULL,
    "rangeKm" INTEGER NOT NULL,
    "chargingType" "ChargingType" NOT NULL,
    "priceEur" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" SERIAL NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" SERIAL NOT NULL,
    "tripDate" TIMESTAMP(3) NOT NULL,
    "distanceKm" INTEGER NOT NULL,
    "co2_g_per_km" INTEGER NOT NULL,
    "grid_intensity_gco2_per_kwh" INTEGER NOT NULL,
    "vehicleVariantId" INTEGER NOT NULL,
    "originId" INTEGER NOT NULL,
    "destinationId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Manufacturer_name_key" ON "Manufacturer"("name");

-- CreateIndex
CREATE INDEX "VehicleModel_manufacturerId_idx" ON "VehicleModel"("manufacturerId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleModel_manufacturerId_name_key" ON "VehicleModel"("manufacturerId", "name");

-- CreateIndex
CREATE INDEX "VehicleVariant_modelId_idx" ON "VehicleVariant"("modelId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleVariant_modelId_batteryKwh_rangeKm_chargingType_key" ON "VehicleVariant"("modelId", "batteryKwh", "rangeKm", "chargingType");

-- CreateIndex
CREATE INDEX "Location_country_city_idx" ON "Location"("country", "city");

-- CreateIndex
CREATE UNIQUE INDEX "Location_city_country_key" ON "Location"("city", "country");

-- CreateIndex
CREATE INDEX "Trip_tripDate_idx" ON "Trip"("tripDate");

-- CreateIndex
CREATE INDEX "Trip_vehicleVariantId_idx" ON "Trip"("vehicleVariantId");

-- CreateIndex
CREATE INDEX "Trip_originId_idx" ON "Trip"("originId");

-- CreateIndex
CREATE INDEX "Trip_destinationId_idx" ON "Trip"("destinationId");

-- AddForeignKey
ALTER TABLE "VehicleModel" ADD CONSTRAINT "VehicleModel_manufacturerId_fkey" FOREIGN KEY ("manufacturerId") REFERENCES "Manufacturer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VehicleVariant" ADD CONSTRAINT "VehicleVariant_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "VehicleModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_vehicleVariantId_fkey" FOREIGN KEY ("vehicleVariantId") REFERENCES "VehicleVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_originId_fkey" FOREIGN KEY ("originId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
