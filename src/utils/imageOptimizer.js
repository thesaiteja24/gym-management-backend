import sharp from 'sharp'

export async function optimizeImage({ buffer, width, height, maxWidth, maxHeight, fit, quality }) {
	let pipeline = sharp(buffer).rotate() // auto-orient + strip EXIF

	if (width && height) {
		pipeline = pipeline.resize(width, height, { fit })
	} else {
		pipeline = pipeline.resize(maxWidth, maxHeight, {
			fit,
			withoutEnlargement: true,
		})
	}

	return pipeline.toFormat('webp', { quality }).toBuffer()
}
