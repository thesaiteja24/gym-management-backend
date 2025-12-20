import sharp from 'sharp'

export async function optimizeImage(buffer, rule) {
	let pipeline = sharp(buffer).rotate() // auto-orient + strip EXIF

	const { resize, output } = rule

	// Exact resize (avatars)
	if (resize.width && resize.height) {
		pipeline = pipeline.resize(resize.width, resize.height, {
			fit: resize.fit,
		})
	}

	// Bounded resize (equipment, posts)
	if (resize.maxWidth || resize.maxHeight) {
		pipeline = pipeline.resize(resize.maxWidth, resize.maxHeight, {
			fit: resize.fit,
			withoutEnlargement: true,
		})
	}

	return pipeline.toFormat(output.format, { quality: output.quality }).toBuffer()
}
