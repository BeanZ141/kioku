import { useRef, useState } from 'react'
import { categories } from '../helpers'

export default function Upload({ onClose, onAdd }) {
  const input = useRef(null)
  const [files, setFiles] = useState([])
  const [tagText, setTagText] = useState('')
  const [chosen, setChosen] = useState([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const choose = (list) => setFiles([...list].filter((file) => file.type.startsWith('image/')))
  const toggleCategory = (category) => {
    setChosen((current) =>
      current.includes(category) ? current.filter((x) => x !== category) : [...current, category]
    )
  }

  const submit = async () => {
    if (!files.length) return
    setBusy(true)
    const tags = [
      ...new Set([...chosen, ...tagText.split(',').map((x) => x.trim()).filter(Boolean)])
    ]
    try {
      await onAdd(files, tags, note)
      onClose()
    } catch (err) {
      console.error(err)
      alert(err.message || 'Upload failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="upload-shell">
      <div className="upload-panel">
        <button className="close-button" onClick={onClose}>
          Close x
        </button>
        <p className="eyebrow">Upload</p>
        <h2>Add images</h2>
        <div
          className="drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            choose(e.dataTransfer.files)
          }}
          onClick={() => input.current?.click()}
        >
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => choose(e.target.files)}
          />
          <span>+</span>
          <strong>Drop images here</strong>
          <small>JPEG, PNG, HEIC</small>
        </div>
        {files.length > 0 && (
          <p className="file-count">
            {files.length} image{files.length === 1 ? '' : 's'} selected
          </p>
        )}
        <fieldset className="category-field">
          <legend>Sections</legend>
          <div>
            {categories.map((category) => (
              <button
                type="button"
                className={chosen.includes(category) ? 'tag selected' : 'tag'}
                onClick={() => toggleCategory(category)}
                key={category}
              >
                {category}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field-grid">
          <label>
            Additional tags
            <input
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
              placeholder="Separated by commas"
            />
          </label>
          <label>
            Note
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
          </label>
        </div>
        <button className="ink-button" onClick={submit} disabled={!files.length || busy}>
          {busy ? 'Uploading...' : 'Add to archive'}
        </button>
      </div>
    </div>
  )
}
