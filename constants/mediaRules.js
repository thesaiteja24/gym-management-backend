export const MEDIA_RULES = {
	profile: {
		width: 256,
		height: 256,
		fit: 'cover',
		quality: 75,
		maxBytes: 30 * 1024, // 30 KB
	},

	equipment: {
		maxWidth: 800,
		maxHeight: 800,
		fit: 'inside',
		quality: 80,
		maxBytes: 120 * 1024, // 120 KB
	},

	post: {
		maxWidth: 1080,
		maxHeight: 1350,
		fit: 'inside',
		quality: 80,
		maxBytes: 250 * 1024, // 250 KB
	},
}
