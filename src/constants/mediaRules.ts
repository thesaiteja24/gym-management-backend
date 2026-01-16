import { FitEnum, FormatEnum } from 'sharp'

export interface ImageMediaRule {
	resize: {
		width?: number
		height?: number
		maxWidth?: number
		maxHeight?: number
		fit?: keyof FitEnum
	}
	output: {
		format: keyof FormatEnum
		quality: number
		maxBytes: number
	}
	limits: {
		maxInputBytes: number
	}
}

export interface VideoMediaRule {
	kind: 'video'
	limits: {
		maxInputBytes: number
	}
	output: {
		format: string
		stripMetadata: boolean
		thumbnailAtSeconds: number
	}
}

export type MediaRule = ImageMediaRule | VideoMediaRule

export interface MediaRulesConfig {
	profile: ImageMediaRule
	equipment: ImageMediaRule
	post: ImageMediaRule
	exerciseThumbnail: ImageMediaRule
	exerciseVideo: VideoMediaRule
	[key: string]: MediaRule
}

export const MEDIA_RULES: MediaRulesConfig = {
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

	exerciseThumbnail: {
		resize: {
			maxWidth: 1350,
			maxHeight: 1080,
			fit: 'inside',
		},
		output: {
			format: 'webp',
			quality: 90,
			maxBytes: 250 * 1024, // ~250 KB
		},
		limits: {
			maxInputBytes: 2 * 1024 * 1024, // extracted frame only
		},
	},

	exerciseVideo: {
		kind: 'video',
		limits: {
			maxInputBytes: 1 * 1024 * 1024, // 1 MB
		},
		output: {
			format: 'mp4',
			stripMetadata: true,
			thumbnailAtSeconds: 0.5,
		},
	},
}
