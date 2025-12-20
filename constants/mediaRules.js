export const MEDIA_RULES = {
	profile: {
		resize: {
			width: 256,
			height: 256,
			fit: 'cover',
		},
		output: {
			format: 'webp',
			quality: 75,
			maxBytes: 30 * 1024, // 30 KB
		},
		limits: {
			maxInputBytes: 5 * 1024 * 1024, // 5 MB
		},
	},

	equipment: {
		resize: {
			maxWidth: 800,
			maxHeight: 800,
			fit: 'inside',
		},
		output: {
			format: 'webp',
			quality: 80,
			maxBytes: 120 * 1024, // 120 KB
		},
		limits: {
			maxInputBytes: 10 * 1024 * 1024, // 10 MB
		},
	},

	post: {
		resize: {
			maxWidth: 1080,
			maxHeight: 1350,
			fit: 'inside',
		},
		output: {
			format: 'webp',
			quality: 80,
			maxBytes: 250 * 1024, // 250 KB
		},
		limits: {
			maxInputBytes: 10 * 1024 * 1024, // 10 MB
		},
	},
}
