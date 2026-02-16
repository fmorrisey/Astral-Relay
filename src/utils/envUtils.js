// Lightweight environment helpers for parsing env values
export const env = process.env;

export const parseMax = (value, fallback) => {
	const n = parseInt(value, 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const parseWindow = (value, fallback) => value || fallback;

export default {
	env,
	parseMax,
	parseWindow
};
