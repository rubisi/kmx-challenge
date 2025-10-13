// Use this file to define the data transfer objects (DTOs) for type safety

// Payload shape for POST /trips
export type TripCreateDTO = {
	trip_date: string;
	manufacturer: string;
	model: string;
	body_type: string;
	segment: string;
	battery_kwh: number;
	range_km: number;
	charging_type: string;
	price_eur: number;
	origin_city: string;
	origin_country: string;
	destination_city: string;
	destination_country: string;
	distance_km: number;
	co2_g_per_km: number;
	grid_intensity_gco2_per_kwh: number;
};

export type TripUpdateDTO = Partial<TripCreateDTO> & {
	// Only provided fields will be updated; others will remain unchanged
	trip_date?: string;
};
