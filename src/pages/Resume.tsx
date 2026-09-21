import { useEffect, useState } from 'react'
import { FileText, RefreshCw, Upload, Trash2, Play } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface ResumeFile {
  name: string
  size: number
  uploadedAt: string
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const units = ['Bytes', 'KB', 'MB', 'GB']
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${Math.round((bytes / Math.pow(1024, index)) * 100) / 100} ${units[index]}`
}

export default function Resume() {
  const [resumes, setResumes] = useState<ResumeFile[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentResume, setCurrentResume] = useState<{ sourceFile: string | null; parsedAt: string | null; textLength: number } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [parsing, setParsing] = useState<string | null>(null)

  const loadResumes = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/resumes')
      if (!response.ok) throw new Error('Failed to load resumes')
      const files: ResumeFile[] = await response.json()
      setResumes(files)
      setSelected(current => current && files.some(file => file.name === current) ? current : files[0]?.name ?? null)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load resumes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadResumes() }, [])

  const loadCurrentResume = async () => {
    const response = await fetch('/api/resume')
    const data = await response.json()
    setCurrentResume(data.exists ? data : null)
  }

  useEffect(() => { loadCurrentResume().catch(() => setCurrentResume(null)) }, [])

  const uploadResume = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('resume', file)
      const response = await fetch('/api/resumes/upload', { method: 'POST', body: formData })
      if (!response.ok) throw new Error((await response.json()).error || 'Upload failed')
      await loadResumes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const deleteResume = async (name: string) => {
    if (!confirm(`Delete ${name}?`)) return
    const response = await fetch(`/api/resumes/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (!response.ok) setError('Failed to delete resume')
    else await loadResumes()
  }

  const parseResume = async (name: string) => {
    setParsing(name)
    try {
      const response = await fetch(`/api/resumes/parse/${encodeURIComponent(name)}`, { method: 'POST' })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to parse resume')
      await loadCurrentResume()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse resume')
    } finally {
      setParsing(null)
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Resume</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Preview resumes stored in the data folder.</p>
        </div>
        <button onClick={loadResumes} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 dark:border-stone-700 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-stone-800">
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resume Management</CardTitle>
          <CardDescription>Upload, parse, delete, and preview PDF resumes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {currentResume && <div className="rounded-lg bg-blue-50 p-4 text-sm text-blue-800 dark:bg-blue-900/20 dark:text-blue-200">Active resume: <strong>{currentResume.sourceFile}</strong>{currentResume.parsedAt ? ` · Parsed ${new Date(currentResume.parsedAt).toLocaleString()}` : ''}</div>}
          <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-sm hover:border-primary-400 ${uploading ? 'pointer-events-none opacity-50' : ''}`}>
            <Upload size={20} /> {uploading ? 'Uploading...' : 'Upload PDF resume'}
            <input type="file" accept=".pdf,application/pdf" className="hidden" onChange={uploadResume} disabled={uploading} />
          </label>
          <div className="space-y-2">
            {resumes.map(file => <div key={file.name} className="flex items-center justify-between rounded-lg border border-gray-200 p-3 dark:border-stone-700">
              <span className="flex min-w-0 items-center gap-2"><FileText size={18} /><span className="truncate text-sm">{file.name}</span></span>
              <span className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => parseResume(file.name)} disabled={parsing === file.name}><Play size={14} className="mr-1" />{parsing === file.name ? 'Parsing...' : 'Parse'}</Button>
                <Button size="sm" variant="ghost" onClick={() => deleteResume(file.name)} className="text-red-600"><Trash2 size={16} /></Button>
              </span>
            </div>)}
          </div>
        </CardContent>
      </Card>

      {error && <p className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-300">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card>
          <CardHeader><CardTitle>Resume files</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {loading && <p className="text-sm text-gray-500">Loading...</p>}
            {!loading && resumes.length === 0 && <p className="text-sm text-gray-500">No PDF resumes found.</p>}
            {resumes.map(file => (
              <button key={file.name} onClick={() => setSelected(file.name)} className={`flex w-full items-start gap-3 rounded-lg p-3 text-left transition-colors ${selected === file.name ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300' : 'hover:bg-gray-100 dark:hover:bg-stone-800'}`}>
                <FileText size={20} className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{file.name}</span>
                  <span className="block text-xs text-gray-500">{formatFileSize(file.size)}</span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="min-h-[700px]">
          <CardHeader><CardTitle>{selected ?? 'Preview'}</CardTitle></CardHeader>
          <CardContent className="h-[620px] pt-0">
            {selected ? <iframe title={`Preview of ${selected}`} src={`/api/resumes/${encodeURIComponent(selected)}`} className="h-full w-full rounded-lg border border-gray-200 dark:border-stone-700" /> : <div className="flex h-full items-center justify-center text-gray-500">Select a resume to preview.</div>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
