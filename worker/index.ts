interface Env {
	DB: D1Database;
	ASSETS: Fetcher;
}

interface PriceQueryRow {
	intercept_map: number;
	month_map: number;
	storey_range_map: number;
	floor_area_sqm_map: number;
	lease_commence_date_map: number;
	month_name: string;
	month_multiplier: number;
	town_map: number;
	flat_model_map: number;
	storey_range_multiplier: number;
}

interface PredictionResponse {
	predictions: Array<{
		month: string;
		predictedPrice: number;
	}>;
}

interface RequestFields {
	model: string;
	monthStart: string;
	monthEnd: string;
	town: string;
	storeyRange: string;
	flatModel: string;
	floorAreaSqm: number;
	leaseCommenceYear: number;
}

function readNumericField(value: unknown, fieldName: string): number {
	const numericValue = Number(value);
	if (!Number.isFinite(numericValue)) {
		throw new Error(`Database field ${fieldName} is not a finite number`);
	}
	return numericValue;
}

function roundToTwo(value: number): number {
	return Math.round((value + Number.EPSILON) * 100) / 100;
}

async function parseRequestFields(request: Request): Promise<RequestFields> {
	let formData: FormData;
	try {
		formData = await request.formData();
	} catch {
		throw new Error('Request body must be form data');
	}

	const model = formData.get('model');
	const monthStart = formData.get('monthStart');
	const monthEnd = formData.get('monthEnd');
	const town = formData.get('town');
	const storeyRange = formData.get('storeyRange');
	const flatModel = formData.get('flatModel');
	const floorAreaSqmRaw = formData.get('floorAreaSqm');
	const leaseCommenceYearRaw = formData.get('leaseCommenceYear');

	const missing = [
		'model', 'monthStart', 'monthEnd', 'town', 'storeyRange',
		'flatModel', 'floorAreaSqm', 'leaseCommenceYear'
	].filter((key) => !formData.get(key));

	if (missing.length > 0) {
		throw new Error(`Missing required fields: ${missing.join(', ')}`);
	}

	const floorAreaSqm = Number(floorAreaSqmRaw);
	const leaseCommenceYear = Number(leaseCommenceYearRaw);

	if (!Number.isFinite(floorAreaSqm) || floorAreaSqm <= 0) {
		throw new Error('floorAreaSqm must be a positive number');
	}
	if (!Number.isFinite(leaseCommenceYear) || leaseCommenceYear < 1900) {
		throw new Error('leaseCommenceYear must be a valid year');
	}

	return {
		model: model as string,
		monthStart: monthStart as string,
		monthEnd: monthEnd as string,
		town: town as string,
		storeyRange: storeyRange as string,
		flatModel: flatModel as string,
		floorAreaSqm,
		leaseCommenceYear,
	};
}

async function handleApiPrices(request: Request, env: Env): Promise<Response> {
	let fields: RequestFields;
	try {
		fields = await parseRequestFields(request);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : 'Invalid request body';
		return new Response(JSON.stringify({ error: message }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' },
		});
	}

	try {
		const { results } = await env.DB.prepare(
			`SELECT
				ml_models.intercept_map,
				ml_models.month_map,
				ml_models.storey_range_map,
				ml_models.floor_area_sqm_map,
				ml_models.lease_commence_date_map,
				months_ordinal.name AS month_name,
				months_ordinal.value AS month_multiplier,
				towns_onehot.value AS town_map,
				flat_models_onehot.value AS flat_model_map,
				storey_ranges_ordinal.value AS storey_range_multiplier
			FROM ml_models
			JOIN towns_onehot ON ml_models.name = towns_onehot.ml_model
			JOIN flat_models_onehot ON ml_models.name = flat_models_onehot.ml_model
			JOIN storey_ranges_ordinal ON storey_ranges_ordinal.name = ?6
			JOIN months_ordinal ON months_ordinal.name BETWEEN ?4 AND ?5
			WHERE ml_models.name = ?1
				AND towns_onehot.name = ?2
				AND flat_models_onehot.name = ?3
			ORDER BY months_ordinal.value ASC;`
		)
			.bind(
				fields.model,
				fields.town,
				fields.flatModel,
				fields.monthStart,
				fields.monthEnd,
				fields.storeyRange
			)
			.all<PriceQueryRow>();

		const [first] = results;
		if (!first) {
			return new Response(
				JSON.stringify({ error: 'No prediction data found for the given parameters.' }),
				{ status: 500, headers: { 'Content-Type': 'application/json' } }
			);
		}

		const baseValue =
			readNumericField(first.intercept_map, 'intercept_map') +
			readNumericField(first.town_map, 'town_map') +
			readNumericField(first.storey_range_multiplier, 'storey_range_multiplier') *
				readNumericField(first.storey_range_map, 'storey_range_map') +
			fields.floorAreaSqm * readNumericField(first.floor_area_sqm_map, 'floor_area_sqm_map') +
			readNumericField(first.flat_model_map, 'flat_model_map') +
			fields.leaseCommenceYear *
				readNumericField(first.lease_commence_date_map, 'lease_commence_date_map');
		const monthCoefficient = readNumericField(first.month_map, 'month_map');

		const predictions = results.map((row) => {
			const predictedRaw =
				baseValue +
				readNumericField(row.month_multiplier, 'month_multiplier') * monthCoefficient;

			if (!Number.isFinite(predictedRaw)) {
				throw new Error(
					`Prediction calculation produced non-finite value for month ${row.month_name}`
				);
			}

			return {
				month: row.month_name,
				predictedPrice: roundToTwo(Math.max(0, predictedRaw))
			};
		});

		const response: PredictionResponse = { predictions };
		return new Response(JSON.stringify(response), {
			headers: { 'Content-Type': 'application/json' },
		});
	} catch (error: unknown) {
		console.error(error);
		const message = error instanceof Error ? error.message : 'Prediction service unavailable.';
		return new Response(JSON.stringify({ error: message }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' },
		});
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === '/api/prices' && request.method === 'POST') {
			return handleApiPrices(request, env);
		}

		return env.ASSETS.fetch(request);
	}
};
