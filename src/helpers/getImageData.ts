import { promises as fs } from 'fs'

import { request } from './request'

export const getImageFile = async (url: URL) => {
  const response = await request({
    method: 'GET',
    url: url.href,
    responseType: 'arraybuffer',
  })

  const buffer = Buffer.from(response.data, 'binary')
  const contentType = response.headers['content-type'] || 'application/octet-stream'

  const filePathSplitted = url.pathname?.split('/')
  const fileName = filePathSplitted[filePathSplitted.length - 1]

  const file = new File([buffer], fileName, { type: 'image/jpeg' })

  try {
    await fs.access(`${process.cwd()}/uploads`)
  } catch (error) {
    await fs.mkdir(`${process.cwd()}/uploads`, { recursive: true })
  }
  const filePath = `${process.cwd()}/uploads/${fileName}`

  await fs.writeFile(filePath, buffer)

  return {
    file,
    filePath,
    buffer,
    fileName,
    contentType,
  }
}
