export const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const categories = ['Nature', 'Travel', 'People', 'Animals', 'Architecture', 'Food', 'Objects', 'Unsorted']

export const dateLabel = (date) => new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date))
export const timeLabel = (date) => new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(new Date(date))

export const newestFirst = (items) => [...items].sort((a, b) => new Date(b.dateTaken) - new Date(a.dateTaken))
export const fileCaption = (item) => `${dateLabel(item.dateTaken)}  ${timeLabel(item.dateTaken)}  ·  ${item.fileSize}`
