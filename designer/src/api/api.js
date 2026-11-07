// Fetch wrapper for the Laravel design API. Same origin as the host page, session cookie + CSRF header.
import { getState } from '../state/store.js';

const toPath = (u) => {
	try {
		const x = new URL(u, window.location.href);
		return x.pathname + x.search;
	} catch {
		return u;
	}
};

export class ApiError extends Error {
	constructor(message, status) {
		super(message);
		this.status = status;
	}
}

async function request(method, path, body) {
	const { csrf } = getState();
	let res;
	try {
		res = await fetch(toPath(path), {
			method,
			credentials: 'same-origin',
			headers: {
				Accept: 'application/json',
				'X-Requested-With': 'XMLHttpRequest',
				'X-CSRF-TOKEN': csrf,
				...(body ? { 'Content-Type': 'application/json' } : {}),
			},
			body: body ? JSON.stringify(body) : undefined,
		});
	} catch {
		throw new ApiError('Network error. Check your connection.', 0);
	}

	let json = null;
	try { json = await res.json(); } catch { /* empty body */ }

	if (!res.ok) {
		if (res.status === 401 || res.status === 419) {
			throw new ApiError('Your session expired. Please sign in again.', res.status);
		}
		const firstError = json?.errors ? Object.values(json.errors).flat()[0] : null;
		throw new ApiError(firstError || json?.message || `Request failed (${res.status})`, res.status);
	}
	return json;
}

export const listDesigns = (base) => request('GET', base).then((r) => r.designs);
export const getDesign = (base, id) => request('GET', `${base}/${id}`);
export const createDesign = (base, payload) => request('POST', base, payload);
export const updateDesign = (base, id, payload) => request('PUT', `${base}/${id}`, payload);
export const renameDesign = (base, id, name) => request('PATCH', `${base}/${id}`, { name });
export const deleteDesign = (base, id) => request('DELETE', `${base}/${id}`);
export const shareDesign = (base, id) => request('POST', `${base}/${id}/share`);
export const unshareDesign = (base, id) => request('DELETE', `${base}/${id}/share`);
