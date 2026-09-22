import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import net from 'net'
import { PDFParse } from 'pdf-parse'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const DEFAULT_PORT = 3010

// Check if a port is available
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port)
  })
}

// Find an available port starting from the default
async function findAvailablePort(startPort, maxAttempts = 10) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i
    if (await isPortAvailable(port)) {
      return port
    }
    console.log(`Port ${port} is in use, trying ${port + 1}...`)
  }
  throw new Error(`No available port found between ${startPort} and ${startPort + maxAttempts - 1}`)
}

// Get paths to JSON files (in data directory)
const knowledgeJsonPath = path.join(__dirname, 'data', 'knowledge.json')
const promptsJsonPath = path.join(__dirname, 'data', 'prompts.json')
const jobFiltersJsonPath = path.join(__dirname, 'data', 'job-filters.json')
const logsJsonPath = path.join(__dirname, 'data', 'logs.json')
const monitoredCompaniesJsonPath = path.join(__dirname, 'data', 'monitored-companies.json')
const jevCredentialsPath = path.join(__dirname, 'credentials', 'jev.json')
const dataDir = path.join(__dirname, 'data')
const applicationsDir = path.join(dataDir, 'applications')
const resumesDir = path.join(dataDir, 'resumes')
const parsedResumesDir = path.join(dataDir, 'parsed_resumes')

// Ensure runtime data directories exist
for (const directory of [dataDir, applicationsDir, resumesDir, parsedResumesDir]) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true })
  }
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are allowed'))
    }
  }
})

const isValidResumeFilename = (filename) => (
  typeof filename === 'string' &&
  filename.toLowerCase().endsWith('.pdf') &&
  !filename.includes('..') &&
  !filename.includes('/') &&
  !filename.includes('\\')
)

const parsedResumePath = (filename) => path.join(
  parsedResumesDir,
  `${path.basename(filename, path.extname(filename))}.txt`
)

app.use(cors())
app.use(express.json())

// Read knowledge.json
app.get('/api/unknown', (req, res) => {
  try {
    if (!fs.existsSync(knowledgeJsonPath)) {
      return res.json([])
    }
    const data = fs.readFileSync(knowledgeJsonPath, 'utf-8')
    const json = data.trim() ? JSON.parse(data) : []
    res.json(Array.isArray(json) ? json : [])
  } catch (error) {
    console.error('Error reading knowledge.json:', error)
    res.status(500).json({ error: 'Failed to read knowledge.json' })
  }
})

// Update knowledge.json
app.post('/api/unknown', (req, res) => {
  try {
    const questions = req.body
    if (!Array.isArray(questions)) {
      return res.status(400).json({ error: 'Invalid data format' })
    }
    fs.writeFileSync(knowledgeJsonPath, JSON.stringify(questions, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (error) {
    console.error('Error writing knowledge.json:', error)
    res.status(500).json({ error: 'Failed to write knowledge.json' })
  }
})

// Update single question
app.put('/api/unknown/:index', (req, res) => {
  try {
    const index = parseInt(req.params.index)
    const updatedQuestion = req.body
    
    if (!fs.existsSync(knowledgeJsonPath)) {
      return res.status(404).json({ error: 'knowledge.json not found' })
    }
    
    const data = fs.readFileSync(knowledgeJsonPath, 'utf-8')
    const questions = data.trim() ? JSON.parse(data) : []
    
    if (!Array.isArray(questions) || index < 0 || index >= questions.length) {
      return res.status(400).json({ error: 'Invalid index' })
    }
    
    questions[index] = updatedQuestion
    fs.writeFileSync(knowledgeJsonPath, JSON.stringify(questions, null, 2), 'utf-8')
    res.json({ success: true, question: updatedQuestion })
  } catch (error) {
    console.error('Error updating question:', error)
    res.status(500).json({ error: 'Failed to update question' })
  }
})

const applicationDatePattern = /^\d{4}-\d{2}-\d{2}$/
const requiredApplicationFields = [
  'company',
  'jobTitle',
  'jobDescription',
  'postedTime',
  'applicationTime',
  'job_link'
]

const validateApplication = (application) => {
  if (!application || typeof application !== 'object' || Array.isArray(application)) {
    return 'Each application must be an object'
  }
  for (const field of requiredApplicationFields) {
    if (typeof application[field] !== 'string' || !application[field].trim()) {
      return `${field} is required`
    }
  }
  if (application.status !== 'needs-review') {
    return 'status must be exactly "needs-review"'
  }
  try {
    const jobUrl = new URL(application.job_link)
    if (!['http:', 'https:'].includes(jobUrl.protocol)) {
      return 'job_link must be a full HTTP(S) URL'
    }
  } catch {
    return 'job_link must be a valid full URL'
  }
  return null
}

const getUtcApplicationDate = (application) => {
  const timestamp = application?.applicationTime || application?.timestamp
  const date = timestamp ? new Date(timestamp) : new Date()
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid application timestamp: ${timestamp}`)
  }
  return date.toISOString().slice(0, 10)
}

const readAllApplications = () => {
  return fs.readdirSync(applicationsDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && applicationDatePattern.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name))
    .flatMap(entry => {
      const applicationsPath = path.join(applicationsDir, entry.name, 'applications.json')
      if (!fs.existsSync(applicationsPath)) return []
      const data = fs.readFileSync(applicationsPath, 'utf-8')
      const applications = data.trim() ? JSON.parse(data) : []
      return Array.isArray(applications) ? applications : []
    })
}

const clearResumeAssignments = (filename) => {
  for (const entry of fs.readdirSync(applicationsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !applicationDatePattern.test(entry.name)) continue
    const applicationsPath = path.join(applicationsDir, entry.name, 'applications.json')
    if (!fs.existsSync(applicationsPath)) continue
    const applications = JSON.parse(fs.readFileSync(applicationsPath, 'utf-8'))
    let changed = false
    const updated = applications.map(application => {
      if (application.resume !== filename) return application
      changed = true
      return { ...application, resume: null }
    })
    if (changed) {
      fs.writeFileSync(applicationsPath, JSON.stringify(updated, null, 2), 'utf-8')
    }
  }
}

const wait = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds))

const callJev = async (apiKey, body) => {
  let lastError
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      })
      const responseText = await response.text()
      let responseData
      try {
        responseData = responseText ? JSON.parse(responseText) : {}
      } catch {
        responseData = { error: responseText || `JEV request failed with status ${response.status}` }
      }
      if (response.ok) return responseData
      const message = responseData?.error?.message || responseData?.error || responseData?.detail || `JEV request failed with status ${response.status}`
      if (![429, 529].includes(response.status) || attempt === 2) {
        const error = new Error(typeof message === 'string' ? message : JSON.stringify(message))
        error.status = response.status
        throw error
      }
      lastError = new Error(typeof message === 'string' ? message : JSON.stringify(message))
      await wait(500 * (2 ** attempt))
    } catch (error) {
      if (error.status || attempt === 2) throw error
      lastError = error
      await wait(500 * (2 ** attempt))
    }
  }
  throw lastError || new Error('JEV request failed')
}

const writeApplicationsByUtcDate = (applications) => {
  const groupedApplications = new Map()

  for (const application of applications) {
    const date = getUtcApplicationDate(application)
    const group = groupedApplications.get(date) || []
    group.push(application)
    groupedApplications.set(date, group)
  }

  // POST /api/applied keeps its previous replace-all behavior.
  for (const entry of fs.readdirSync(applicationsDir, { withFileTypes: true })) {
    if (entry.isDirectory() && applicationDatePattern.test(entry.name)) {
      fs.rmSync(path.join(applicationsDir, entry.name), { recursive: true, force: true })
    }
  }

  for (const [date, dateApplications] of groupedApplications) {
    const dateDir = path.join(applicationsDir, date)
    fs.mkdirSync(dateDir, { recursive: true })
    fs.writeFileSync(
      path.join(dateDir, 'applications.json'),
      JSON.stringify(dateApplications, null, 2),
      'utf-8'
    )
  }
}

// Read and aggregate applications from UTC date folders
app.get('/api/applied', (req, res) => {
  try {
    res.json(readAllApplications())
  } catch (error) {
    console.error('Error reading applications:', error)
    res.status(500).json({ error: 'Failed to read applications' })
  }
})

// Replace application records, grouped by applicationTime in UTC
app.post('/api/applied', (req, res) => {
  try {
    const applications = req.body
    if (!Array.isArray(applications)) {
      return res.status(400).json({ error: 'Invalid data format' })
    }
    for (const application of applications) {
      const validationError = validateApplication(application)
      if (validationError) {
        return res.status(400).json({ error: validationError })
      }
    }
    writeApplicationsByUtcDate(applications)
    res.json({ success: true })
  } catch (error) {
    console.error('Error writing applications:', error)
    res.status(500).json({ error: error.message || 'Failed to write applications' })
  }
})

// Assign a parsed resume to one job-review record
app.patch('/api/applied/resume', (req, res) => {
  try {
    const { applicationTime, job_link, resume } = req.body
    if (typeof applicationTime !== 'string' || typeof job_link !== 'string') {
      return res.status(400).json({ error: 'applicationTime and job_link are required' })
    }
    if (resume !== null) {
      if (!isValidResumeFilename(resume)) {
        return res.status(400).json({ error: 'Invalid resume filename' })
      }
      if (!fs.existsSync(path.join(resumesDir, resume))) {
        return res.status(404).json({ error: 'Resume PDF not found' })
      }
      if (!fs.existsSync(parsedResumePath(resume))) {
        return res.status(400).json({ error: 'Parse this resume before assigning it' })
      }
    }

    const date = getUtcApplicationDate({ applicationTime })
    const applicationsPath = path.join(applicationsDir, date, 'applications.json')
    if (!fs.existsSync(applicationsPath)) {
      return res.status(404).json({ error: 'Application record not found' })
    }
    const applications = JSON.parse(fs.readFileSync(applicationsPath, 'utf-8'))
    const index = applications.findIndex(application => (
      application.applicationTime === applicationTime && application.job_link === job_link
    ))
    if (index === -1) {
      return res.status(404).json({ error: 'Application record not found' })
    }
    applications[index] = { ...applications[index], resume }
    fs.writeFileSync(applicationsPath, JSON.stringify(applications, null, 2), 'utf-8')
    res.json({ success: true, application: applications[index] })
  } catch (error) {
    console.error('Error assigning resume:', error)
    res.status(500).json({ error: error.message || 'Failed to assign resume' })
  }
})

// Ask JEV to choose the best parsed resume for a job-review record
app.post('/api/applied/classify', async (req, res) => {
  try {
    const { applicationTime, job_link } = req.body
    if (typeof applicationTime !== 'string' || typeof job_link !== 'string') {
      return res.status(400).json({ error: 'applicationTime and job_link are required' })
    }
    if (!fs.existsSync(jevCredentialsPath)) {
      return res.status(503).json({ error: 'Create credentials/jev.json and add your TypeSafe API key' })
    }
    const credentials = JSON.parse(fs.readFileSync(jevCredentialsPath, 'utf-8'))
    if (typeof credentials.apiKey !== 'string' || !credentials.apiKey.trim()) {
      return res.status(503).json({ error: 'Add apiKey to credentials/jev.json' })
    }

    const date = getUtcApplicationDate({ applicationTime })
    const applicationsPath = path.join(applicationsDir, date, 'applications.json')
    if (!fs.existsSync(applicationsPath)) {
      return res.status(404).json({ error: 'Application record not found' })
    }
    const applications = JSON.parse(fs.readFileSync(applicationsPath, 'utf-8'))
    const index = applications.findIndex(application => (
      application.applicationTime === applicationTime && application.job_link === job_link
    ))
    if (index === -1) {
      return res.status(404).json({ error: 'Application record not found' })
    }

    const criteria = {}
    for (const filename of fs.readdirSync(resumesDir)) {
      if (!filename.toLowerCase().endsWith('.pdf')) continue
      const parsedPath = parsedResumePath(filename)
      if (!fs.existsSync(parsedPath)) continue
      criteria[filename] = {
        parsedText: fs.readFileSync(parsedPath, 'utf-8')
      }
    }
    if (Object.keys(criteria).length === 0) {
      return res.status(400).json({ error: 'Parse at least one resume before running JEV Classifier' })
    }

    const application = applications[index]
    const requestBody = {
      state: {
        jobTitle: application.jobTitle,
        jobDescription: application.jobDescription
      },
      model: 'jev-latest',
      questions: {
        best_resume: {
          type: 'choice',
          instructions: 'Which resume is the best suit for this role?',
          criteria
        }
      }
    }
    const jevResponse = await callJev(credentials.apiKey.trim(), requestBody)
    const answer = jevResponse?.answers?.best_resume
    const choice = answer?.choice
    if (typeof choice !== 'string' || !Object.hasOwn(criteria, choice)) {
      return res.status(502).json({ error: 'JEV returned an invalid resume choice', response: jevResponse })
    }

    const classification = {
      choice,
      confidence: answer.confidence ?? null,
      probabilities: answer.probabilities ?? {},
      model: jevResponse.model || 'jev-latest',
      classifiedAt: new Date().toISOString(),
      requestPayload: requestBody,
      responsePayload: jevResponse
    }
    applications[index] = {
      ...application,
      resume: choice,
      jevClassification: classification
    }
    fs.writeFileSync(applicationsPath, JSON.stringify(applications, null, 2), 'utf-8')
    res.json({
      success: true,
      choice,
      classification,
      response: jevResponse
    })
  } catch (error) {
    console.error('JEV classification failed:', error)
    const status = Number.isInteger(error.status) ? error.status : 500
    res.status(status).json({ error: error.message || 'JEV classification failed' })
  }
})

// Get list of resume files
app.get('/api/resumes', (req, res) => {
  try {
    const files = fs.readdirSync(resumesDir)
    const resumeFiles = files
      .filter(file => file.toLowerCase().endsWith('.pdf'))
      .map(file => {
        const filePath = path.join(resumesDir, file)
        const stats = fs.statSync(filePath)
        const parsedPath = parsedResumePath(file)
        const parsedStats = fs.existsSync(parsedPath) ? fs.statSync(parsedPath) : null
        return {
          name: file,
          type: 'application/pdf',
          size: stats.size,
          uploadedAt: stats.mtime.toISOString(),
          parsed: Boolean(parsedStats),
          parsedFile: parsedStats ? path.basename(parsedPath) : null,
          parsedAt: parsedStats ? parsedStats.mtime.toISOString() : null
        }
      })
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    
    res.json(resumeFiles)
  } catch (error) {
    console.error('Error reading resume files:', error)
    res.status(500).json({ error: 'Failed to read resume files' })
  }
})

// Preview a resume PDF from the data directory
app.get('/api/resumes/:filename', (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename)
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\') || !filename.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Invalid resume filename' })
    }

    const filePath = path.join(resumesDir, filename)
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Resume not found' })
    }

    res.sendFile(filePath)
  } catch (error) {
    console.error('Error serving resume:', error)
    res.status(500).json({ error: 'Failed to serve resume' })
  }
})

// Upload resume file
app.post('/api/resumes/upload', (req, res) => {
  console.log('Upload request received')
  upload.single('resume')(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err)
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' })
        }
        return res.status(400).json({ error: err.message || 'Upload error' })
      }
      return res.status(400).json({ error: err.message || 'Upload failed' })
    }
    
    try {
      if (!req.file) {
        console.log('No file in request')
        return res.status(400).json({ error: 'No file uploaded. Please select a PDF file.' })
      }
      
      const filename = path.basename(req.file.originalname)
      if (!isValidResumeFilename(filename)) {
        return res.status(400).json({ error: 'Invalid PDF filename' })
      }
      const hasDuplicateName = fs.readdirSync(resumesDir).some(
        existing => existing.toLowerCase() === filename.toLowerCase()
      )
      const filePath = path.join(resumesDir, filename)
      if (hasDuplicateName) {
        return res.status(409).json({
          error: `A resume named "${filename}" already exists. Rename the file or use Update.`
        })
      }
      fs.writeFileSync(filePath, req.file.buffer)
      console.log('File uploaded successfully:', filename)
      res.json({
        success: true,
        file: {
          name: filename,
          size: req.file.size,
          uploadedAt: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error('Error processing upload:', error)
      res.status(500).json({ error: error.message || 'Failed to upload resume' })
    }
  })
})

// Explicitly replace an existing PDF while preserving its unique filename
app.put('/api/resumes/:filename', (req, res) => {
  upload.single('resume')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' })
      }
      return res.status(400).json({ error: err.message || 'Update failed' })
    }
    try {
      const filename = decodeURIComponent(req.params.filename)
      if (!isValidResumeFilename(filename)) {
        return res.status(400).json({ error: 'Invalid resume filename' })
      }
      const filePath = path.join(resumesDir, filename)
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Resume not found' })
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No replacement PDF uploaded' })
      }
      fs.writeFileSync(filePath, req.file.buffer)
      const parsedPath = parsedResumePath(filename)
      if (fs.existsSync(parsedPath)) fs.unlinkSync(parsedPath)
      clearResumeAssignments(filename)
      res.json({ success: true, requiresParse: true })
    } catch (error) {
      console.error('Error updating resume:', error)
      res.status(500).json({ error: error.message || 'Failed to update resume' })
    }
  })
})

// Delete resume file
app.delete('/api/resumes/:filename', (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename)
    // Security: prevent directory traversal
    if (!isValidResumeFilename(filename)) {
      return res.status(400).json({ error: 'Invalid filename' })
    }

    const filePath = path.join(resumesDir, filename)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }

    fs.unlinkSync(filePath)
    const parsedPath = parsedResumePath(filename)
    if (fs.existsSync(parsedPath)) fs.unlinkSync(parsedPath)
    clearResumeAssignments(filename)
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting resume:', error)
    res.status(500).json({ error: 'Failed to delete resume' })
  }
})

// Parse each PDF into its own matching text file
app.post('/api/resumes/parse/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename)
    // Security: prevent directory traversal
    if (!isValidResumeFilename(filename)) {
      return res.status(400).json({ error: 'Invalid filename' })
    }

    const filePath = path.join(resumesDir, filename)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' })
    }

    console.log('Parsing resume:', filename)

    // Read PDF file buffer
    const dataBuffer = fs.readFileSync(filePath)

    // Parse the PDF using pdf-parse v2
    const parser = new PDFParse({ data: dataBuffer })
    const result = await parser.getText()
    const text = result.text
    console.log('Extracted text length:', text.length)

    // Clean up the parser
    await parser.destroy()

    const outputPath = parsedResumePath(filename)
    fs.writeFileSync(outputPath, text, 'utf-8')
    console.log('Resume text saved to:', outputPath)

    res.json({
      success: true,
      sourceFile: filename,
      parsedFile: path.basename(outputPath),
      textLength: text.length
    })
  } catch (error) {
    console.error('Error parsing resume:', error)
    res.status(500).json({ error: error.message || 'Failed to parse resume' })
  }
})

// Prompts API
// Get all prompts
app.get('/api/prompts', (req, res) => {
  try {
    if (!fs.existsSync(promptsJsonPath)) {
      return res.json({ prompts: [] })
    }
    const data = fs.readFileSync(promptsJsonPath, 'utf-8')
    const json = data.trim() ? JSON.parse(data) : { prompts: [] }

    // Load content from .md files if file field exists
    const promptsWithContent = json.prompts.map(prompt => {
      if (prompt.file) {
        const filePath = path.join(dataDir, prompt.file)
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf-8')
          return { ...prompt, content }
        }
      }
      return prompt
    })

    res.json({ prompts: promptsWithContent })
  } catch (error) {
    console.error('Error reading prompts.json:', error)
    res.status(500).json({ error: 'Failed to read prompts.json' })
  }
})

// Create new prompt
app.post('/api/prompts', (req, res) => {
  try {
    const { name, content, isDefault } = req.body

    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' })
    }

    let promptsData = { prompts: [] }
    if (fs.existsSync(promptsJsonPath)) {
      const data = fs.readFileSync(promptsJsonPath, 'utf-8')
      promptsData = data.trim() ? JSON.parse(data) : { prompts: [] }
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      promptsData.prompts = promptsData.prompts.map(p => ({ ...p, isDefault: false }))
    }

    const promptId = `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const fileName = `prompts/${promptId}.md`
    const filePath = path.join(dataDir, fileName)

    // Save content to .md file
    fs.writeFileSync(filePath, content, 'utf-8')

    const newPrompt = {
      id: promptId,
      name,
      file: fileName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDefault: isDefault || false
    }

    promptsData.prompts.push(newPrompt)
    fs.writeFileSync(promptsJsonPath, JSON.stringify(promptsData, null, 2), 'utf-8')

    // Return prompt with content for client
    res.json({ success: true, prompt: { ...newPrompt, content } })
  } catch (error) {
    console.error('Error creating prompt:', error)
    res.status(500).json({ error: 'Failed to create prompt' })
  }
})

// Update prompt
app.put('/api/prompts/:id', (req, res) => {
  try {
    const { id } = req.params
    const { name, content, isDefault } = req.body

    if (!fs.existsSync(promptsJsonPath)) {
      return res.status(404).json({ error: 'prompts.json not found' })
    }

    const data = fs.readFileSync(promptsJsonPath, 'utf-8')
    const promptsData = data.trim() ? JSON.parse(data) : { prompts: [] }

    const index = promptsData.prompts.findIndex(p => p.id === id)
    if (index === -1) {
      return res.status(404).json({ error: 'Prompt not found' })
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      promptsData.prompts = promptsData.prompts.map(p =>
        p.id === id ? p : { ...p, isDefault: false }
      )
    }

    const prompt = promptsData.prompts[index]

    // Update content in .md file if content is provided
    if (content !== undefined && prompt.file) {
      const filePath = path.join(dataDir, prompt.file)
      fs.writeFileSync(filePath, content, 'utf-8')
    }

    // Update metadata in prompts.json
    promptsData.prompts[index] = {
      ...prompt,
      name: name !== undefined ? name : prompt.name,
      isDefault: isDefault !== undefined ? isDefault : prompt.isDefault,
      updatedAt: new Date().toISOString()
    }

    fs.writeFileSync(promptsJsonPath, JSON.stringify(promptsData, null, 2), 'utf-8')

    // Return updated prompt with content
    const updatedPrompt = { ...promptsData.prompts[index] }
    if (updatedPrompt.file) {
      const filePath = path.join(dataDir, updatedPrompt.file)
      if (fs.existsSync(filePath)) {
        updatedPrompt.content = fs.readFileSync(filePath, 'utf-8')
      }
    }

    res.json({ success: true, prompt: updatedPrompt })
  } catch (error) {
    console.error('Error updating prompt:', error)
    res.status(500).json({ error: 'Failed to update prompt' })
  }
})

// Delete prompt
app.delete('/api/prompts/:id', (req, res) => {
  try {
    const { id } = req.params

    if (!fs.existsSync(promptsJsonPath)) {
      return res.status(404).json({ error: 'prompts.json not found' })
    }

    const data = fs.readFileSync(promptsJsonPath, 'utf-8')
    const promptsData = data.trim() ? JSON.parse(data) : { prompts: [] }

    const index = promptsData.prompts.findIndex(p => p.id === id)
    if (index === -1) {
      return res.status(404).json({ error: 'Prompt not found' })
    }

    const prompt = promptsData.prompts[index]

    // Delete the .md file if it exists
    if (prompt.file) {
      const filePath = path.join(dataDir, prompt.file)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    }

    promptsData.prompts.splice(index, 1)
    fs.writeFileSync(promptsJsonPath, JSON.stringify(promptsData, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting prompt:', error)
    res.status(500).json({ error: 'Failed to delete prompt' })
  }
})

// Job Filters API
// Get all job filters
app.get('/api/job-filters', (req, res) => {
  try {
    if (!fs.existsSync(jobFiltersJsonPath)) {
      return res.json({ filters: [] })
    }
    const data = fs.readFileSync(jobFiltersJsonPath, 'utf-8')
    const json = data.trim() ? JSON.parse(data) : { filters: [] }
    res.json(json)
  } catch (error) {
    console.error('Error reading job-filters.json:', error)
    res.status(500).json({ error: 'Failed to read job-filters.json' })
  }
})

// Update job filters
app.post('/api/job-filters', (req, res) => {
  try {
    const { filters } = req.body

    if (!Array.isArray(filters)) {
      return res.status(400).json({ error: 'Invalid data format' })
    }

    fs.writeFileSync(jobFiltersJsonPath, JSON.stringify({ filters }, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (error) {
    console.error('Error writing job-filters.json:', error)
    res.status(500).json({ error: 'Failed to write job-filters.json' })
  }
})

// Logs API
// Get all logs
app.get('/api/logs', (req, res) => {
  try {
    if (!fs.existsSync(logsJsonPath)) {
      return res.json({ sessions: [] })
    }
    const data = fs.readFileSync(logsJsonPath, 'utf-8')
    const json = data.trim() ? JSON.parse(data) : { sessions: [] }
    res.json(json)
  } catch (error) {
    console.error('Error reading logs.json:', error)
    res.status(500).json({ error: 'Failed to read logs.json' })
  }
})

// Create new log session
app.post('/api/logs', (req, res) => {
  try {
    const { session } = req.body

    if (!session || !session.id) {
      return res.status(400).json({ error: 'Invalid session data' })
    }

    let logsData = { sessions: [] }
    if (fs.existsSync(logsJsonPath)) {
      const data = fs.readFileSync(logsJsonPath, 'utf-8')
      logsData = data.trim() ? JSON.parse(data) : { sessions: [] }
    }

    // Add new session at the beginning
    logsData.sessions.unshift(session)

    // Keep only last 50 sessions
    if (logsData.sessions.length > 50) {
      logsData.sessions = logsData.sessions.slice(0, 50)
    }

    fs.writeFileSync(logsJsonPath, JSON.stringify(logsData, null, 2), 'utf-8')
    res.json({ success: true, session })
  } catch (error) {
    console.error('Error creating log session:', error)
    res.status(500).json({ error: 'Failed to create log session' })
  }
})

// Append log entry to existing session
app.post('/api/logs/:sessionId/entries', (req, res) => {
  try {
    const { sessionId } = req.params
    const { entry } = req.body

    if (!entry) {
      return res.status(400).json({ error: 'Invalid entry data' })
    }

    if (!fs.existsSync(logsJsonPath)) {
      return res.status(404).json({ error: 'No logs found' })
    }

    const data = fs.readFileSync(logsJsonPath, 'utf-8')
    const logsData = data.trim() ? JSON.parse(data) : { sessions: [] }

    const session = logsData.sessions.find(s => s.id === sessionId)
    if (!session) {
      return res.status(404).json({ error: 'Session not found' })
    }

    if (!session.entries) {
      session.entries = []
    }
    session.entries.push(entry)
    session.updatedAt = new Date().toISOString()

    fs.writeFileSync(logsJsonPath, JSON.stringify(logsData, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (error) {
    console.error('Error appending log entry:', error)
    res.status(500).json({ error: 'Failed to append log entry' })
  }
})

// Delete log session
app.delete('/api/logs/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params

    if (!fs.existsSync(logsJsonPath)) {
      return res.status(404).json({ error: 'No logs found' })
    }

    const data = fs.readFileSync(logsJsonPath, 'utf-8')
    const logsData = data.trim() ? JSON.parse(data) : { sessions: [] }

    const index = logsData.sessions.findIndex(s => s.id === sessionId)
    if (index === -1) {
      return res.status(404).json({ error: 'Session not found' })
    }

    logsData.sessions.splice(index, 1)
    fs.writeFileSync(logsJsonPath, JSON.stringify(logsData, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (error) {
    console.error('Error deleting log session:', error)
    res.status(500).json({ error: 'Failed to delete log session' })
  }
})

// Monitored Companies API
// Get all monitored companies
app.get('/api/monitored-companies', (req, res) => {
  try {
    if (!fs.existsSync(monitoredCompaniesJsonPath)) {
      return res.json({ companies: [] })
    }
    const data = fs.readFileSync(monitoredCompaniesJsonPath, 'utf-8')
    const json = data.trim() ? JSON.parse(data) : { companies: [] }
    res.json(json)
  } catch (error) {
    console.error('Error reading monitored-companies.json:', error)
    res.status(500).json({ error: 'Failed to read monitored-companies.json' })
  }
})

// Update monitored companies
app.post('/api/monitored-companies', (req, res) => {
  try {
    const { companies } = req.body

    if (!Array.isArray(companies)) {
      return res.status(400).json({ error: 'Invalid data format' })
    }

    fs.writeFileSync(monitoredCompaniesJsonPath, JSON.stringify({ companies }, null, 2), 'utf-8')
    res.json({ success: true })
  } catch (error) {
    console.error('Error writing monitored-companies.json:', error)
    res.status(500).json({ error: 'Failed to write monitored-companies.json' })
  }
})

// Start server with automatic port selection
;(async () => {
  try {
    const port = await findAvailablePort(DEFAULT_PORT)
    app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error.message)
    process.exit(1)
  }
})()
