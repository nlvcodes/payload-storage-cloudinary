import {getPayload} from "payload";
import config from '@payload-config'
import { getTransformationUrl, commonPresets } from 'payload-storage-cloudinary'

export default async function Home() {
    const payload = await getPayload({config})
    const doc = await payload.find({
        collection: 'products',
        where: {
            name: {equals: 'Test 4'}
        }
    }).then(res => res.docs[0])

    const thumbnailUrl = getTransformationUrl({
  publicId: doc.productImage.cloudinaryPublicId,
  version: doc.productImage.cloudinaryVersion,
  presets: commonPresets,
})

  return (
    <div>
      <h1>Cloudinary Storage Plugin Test</h1>
      <p>Go to <a href="/admin">/admin</a> to access the Payload admin panel.</p>
      <img
      src={thumbnailUrl}
      alt={doc.productImage.alt}
      width={doc.productImage.width}
      height={doc.productImage.height}
    />
    </div>
  )
}