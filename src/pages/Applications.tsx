import { useState, useEffect, useMemo, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, X, Filter, ArrowUp, ArrowDown, ExternalLink } from 'lucide-react'

interface Application {
  company: string
  jobTitle: string
  jobDescription: string
  postedTime: string
  applicationTime: string
  status: 'needs-review'
  job_link: string
  resume?: string | null
  jevClassification?: {
    choice: string
    confidence: number | null
    probabilities: Record<string, number>
    model: string
    classifiedAt: string
    requestPayload?: unknown
    responsePayload?: unknown
  }
}

interface ResumeOption {
  name: string
  parsed: boolean
}

type LinkFilter = 'all' | 'with-link' | 'no-link'
type StatusFilter = 'all' | 'needs-review'
type SortOrder = 'newest-first' | 'oldest-first'

const ITEMS_PER_PAGE = 20

export default function Applications() {
  const [applications, setApplications] = useState<Application[]>([])
  const [resumes, setResumes] = useState<ResumeOption[]>([])
  const [classifying, setClassifying] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [companyFilter, setCompanyFilter] = useState<string>('')
  const [positionFilter, setPositionFilter] = useState<string>('')
  const sortOrder: SortOrder = 'newest-first'
  const [postedSort, setPostedSort] = useState<'asc' | 'desc' | null>(null) // null = not active, asc = oldest first, desc = newest first
  const [appliedSort, setAppliedSort] = useState<'asc' | 'desc' | null>(null) // null = not active, asc = oldest first, desc = newest first
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedFilter, setExpandedFilter] = useState<string | null>(null)
  const [expandedApplications, setExpandedApplications] = useState<Set<string>>(new Set())
  const filterPopupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const fetchApplications = async () => {
      try {
        const response = await fetch('/api/applied')
        const data = await response.json()
        setApplications(data)
      } catch (error) {
        console.error('Failed to load applications:', error)
        setApplications([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchApplications()
    fetch('/api/resumes')
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Failed to load resumes')))
      .then((files: ResumeOption[]) => setResumes(files.filter(file => file.parsed)))
      .catch(error => {
        console.error('Failed to load resumes:', error)
        setResumes([])
      })
  }, [])

  const assignResume = async (application: Application, resume: string | null) => {
    try {
      const response = await fetch('/api/applied/resume', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationTime: application.applicationTime,
          job_link: application.job_link,
          resume,
        }),
      })
      if (!response.ok) throw new Error((await response.json()).error || 'Failed to assign resume')
      setApplications(current => current.map(item => (
        item.applicationTime === application.applicationTime && item.job_link === application.job_link
          ? { ...item, resume }
          : item
      )))
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to assign resume')
    }
  }

  const runJevClassifier = async (application: Application) => {
    const key = `${application.applicationTime}:${application.job_link}`
    setClassifying(key)
    try {
      const response = await fetch('/api/applied/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationTime: application.applicationTime,
          job_link: application.job_link,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'JEV classification failed')
      setApplications(current => current.map(item => (
        item.applicationTime === application.applicationTime && item.job_link === application.job_link
          ? { ...item, resume: result.choice, jevClassification: result.classification }
          : item
      )))
    } catch (error) {
      alert(error instanceof Error ? error.message : 'JEV classification failed')
    } finally {
      setClassifying(null)
    }
  }

  const applicationKey = (application: Application) => `${application.applicationTime}:${application.job_link}`
  const toggleApplication = (application: Application) => {
    const key = applicationKey(application)
    setExpandedApplications(current => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const formatPayload = (payload: unknown) => JSON.stringify(payload ?? {}, null, 2)

  // Filter and sort applications
  const filteredAndSortedApplications = useMemo(() => {
    let filtered = [...applications]

    // Apply link filter
    if (linkFilter === 'with-link') {
      filtered = filtered.filter(app => app.job_link && app.job_link.trim() !== '')
    } else if (linkFilter === 'no-link') {
      filtered = filtered.filter(app => !app.job_link || app.job_link.trim() === '')
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(app => {
        return app.status === statusFilter
      })
    }

    // Apply company filter (case-insensitive match)
    if (companyFilter.trim() !== '') {
      const companySearch = companyFilter.trim().toLowerCase()
      filtered = filtered.filter(app => 
        app.company.toLowerCase().includes(companySearch)
      )
    }

    // Apply position filter (case-insensitive match)
    if (positionFilter.trim() !== '') {
      const positionSearch = positionFilter.trim().toLowerCase()
      filtered = filtered.filter(app => 
        app.jobTitle.toLowerCase().includes(positionSearch)
      )
    }

    // Apply sort - priority: Applied > Posted > Sort Order
    filtered.sort((a, b) => {
      // First sort by Applied time if sort is set
      if (appliedSort !== null) {
        const timeA = new Date(a.applicationTime).getTime()
        const timeB = new Date(b.applicationTime).getTime()
        const result = appliedSort === 'desc' ? timeB - timeA : timeA - timeB
        if (result !== 0) return result
      }
      
      // Then sort by Posted time if sort is set
      if (postedSort !== null) {
        // Parse postedTime to get timestamp
        const parsePostedTime = (postedTime: string): number => {
          // Try to parse as ISO timestamp first
          const timestamp = Date.parse(postedTime)
          if (!isNaN(timestamp)) {
            return timestamp
          }

          // Fallback: parse old format "X hours ago" or "X days ago"
          const hoursMatch = postedTime.match(/(\d+)\s*hours?\s*ago/i)
          const daysMatch = postedTime.match(/(\d+)\s*days?\s*ago/i)

          if (hoursMatch) {
            const hours = parseInt(hoursMatch[1])
            return Date.now() - hours * 60 * 60 * 1000
          } else if (daysMatch) {
            const days = parseInt(daysMatch[1])
            return Date.now() - days * 24 * 60 * 60 * 1000
          }
          return 0
        }

        const timeA = parsePostedTime(a.postedTime)
        const timeB = parsePostedTime(b.postedTime)
        const result = postedSort === 'desc' ? timeB - timeA : timeA - timeB
        if (result !== 0) return result
      }
      
      // Finally, use the default sort order
      const timeA = new Date(a.applicationTime).getTime()
      const timeB = new Date(b.applicationTime).getTime()
      return sortOrder === 'newest-first' ? timeB - timeA : timeA - timeB
    })

    return filtered
  }, [applications, linkFilter, statusFilter, companyFilter, positionFilter, sortOrder, postedSort, appliedSort])

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedApplications.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedApplications = filteredAndSortedApplications.slice(startIndex, endIndex)

  // Reset to page 1 when filter or sort changes
  useEffect(() => {
    setCurrentPage(1)
  }, [linkFilter, statusFilter, companyFilter, positionFilter, sortOrder, postedSort, appliedSort])

  // Close popup when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterPopupRef.current && !filterPopupRef.current.contains(event.target as Node)) {
        // Check if click is not on a filter button
        const target = event.target as HTMLElement
        if (!target.closest('[data-filter-button]')) {
          setExpandedFilter(null)
        }
      }
    }

    if (expandedFilter) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [expandedFilter])

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const formatPostedTime = (postedTime: string) => {
    // Try to parse as ISO timestamp first
    const timestamp = Date.parse(postedTime)
    if (!isNaN(timestamp)) {
      const now = Date.now()
      const diff = now - timestamp
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const days = Math.floor(hours / 24)

      if (hours < 1) {
        const minutes = Math.floor(diff / (1000 * 60))
        return minutes <= 1 ? '1 minute ago' : `${minutes} minutes ago`
      } else if (hours < 24) {
        return hours === 1 ? '1 hour ago' : `${hours} hours ago`
      } else {
        return days === 1 ? '1 day ago' : `${days} days ago`
      }
    }

    // Fallback: try to parse old format "X hours ago"
    const hoursMatch = postedTime.match(/(\d+)\s*hours?\s*ago/i)
    const daysMatch = postedTime.match(/(\d+)\s*days?\s*ago/i)

    if (hoursMatch) {
      const hours = parseInt(hoursMatch[1])
      if (hours < 24) {
        return `${hours} hour${hours !== 1 ? 's' : ''} ago`
      } else {
        const days = Math.floor(hours / 24)
        return `${days} day${days !== 1 ? 's' : ''} ago`
      }
    } else if (daysMatch) {
      const days = parseInt(daysMatch[1])
      return `${days} day${days !== 1 ? 's' : ''} ago`
    }

    // Last resort: return original string
    return postedTime
  }


  const togglePostedSort = () => {
    setPostedSort(prev => {
      if (prev === null) return 'asc'
      if (prev === 'asc') return 'desc'
      return null
    })
    // Clear applied sort when toggling posted sort
    setAppliedSort(null)
  }

  const toggleAppliedSort = () => {
    setAppliedSort(prev => {
      if (prev === null) return 'asc'
      if (prev === 'asc') return 'desc'
      return null
    })
    // Clear posted sort when toggling applied sort
    setPostedSort(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Applications
          </h2>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {isLoading ? (
            'Loading...'
          ) : (
              <>
                Showing <span className="font-medium">{filteredAndSortedApplications.length}</span> of <span className="font-medium">{applications.length}</span>
              </>
          )}
        </div>
      </div>

      <Card className="border-gray-200 dark:border-stone-700 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
        <CardContent className="p-6">
              <div className="overflow-auto">
                <Table className="table-fixed w-full">
                  <TableHeader>
                    {/* Title Row with Filter Buttons */}
                    <TableRow className="border-gray-200 dark:border-stone-700">
                      <TableHead className="text-sm font-semibold text-gray-700 dark:text-gray-300 relative w-[150px]">
                        <div className="flex items-center gap-2">
                          <span>Company</span>
                          <button
                            data-filter-button
                            onClick={() => setExpandedFilter(expandedFilter === 'company' ? null : 'company')}
                            className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-stone-700 transition-colors ${
                              companyFilter ? 'text-blue-600 dark:text-blue-400' : expandedFilter === 'company' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'
                            }`}
                            title="Filter by company"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {expandedFilter === 'company' && (
                          <div
                            ref={filterPopupRef}
                            className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-stone-800 border border-gray-300 dark:border-stone-600 rounded-lg shadow-lg p-3 min-w-[200px]"
                          >
                            <div className="relative">
                              <input
                                type="text"
                                value={companyFilter}
                                onChange={(e) => setCompanyFilter(e.target.value)}
                                placeholder="Filter by company..."
                                autoFocus
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-stone-600 rounded bg-white dark:bg-stone-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              />
                              {companyFilter && (
                                <button
                                  onClick={() => setCompanyFilter('')}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </TableHead>
                      <TableHead className="text-sm font-semibold text-gray-700 dark:text-gray-300 relative w-[200px]">
                        <div className="flex items-center gap-2">
                          <span>Position</span>
                          <button
                            data-filter-button
                            onClick={() => setExpandedFilter(expandedFilter === 'position' ? null : 'position')}
                            className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-stone-700 transition-colors ${
                              positionFilter ? 'text-blue-600 dark:text-blue-400' : expandedFilter === 'position' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'
                            }`}
                            title="Filter by position"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {expandedFilter === 'position' && (
                          <div
                            ref={filterPopupRef}
                            className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-stone-800 border border-gray-300 dark:border-stone-600 rounded-lg shadow-lg p-3 min-w-[200px]"
                          >
                            <div className="relative">
                              <input
                                type="text"
                                value={positionFilter}
                                onChange={(e) => setPositionFilter(e.target.value)}
                                placeholder="Filter by position..."
                                autoFocus
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-stone-600 rounded bg-white dark:bg-stone-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                              />
                              {positionFilter && (
                                <button
                                  onClick={() => setPositionFilter('')}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </TableHead>
                      <TableHead className="hidden">
                        Job Description
                      </TableHead>
                      <TableHead className="hidden">
                        <button
                          onClick={togglePostedSort}
                          className="flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                          title={postedSort === 'asc' ? 'Oldest first (click to reverse)' : postedSort === 'desc' ? 'Newest first (click to clear)' : 'Click to sort'}
                        >
                          <span>Posted</span>
                          {postedSort === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          ) : postedSort === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          ) : null}
                        </button>
                      </TableHead>
                      <TableHead className="hidden">
                        <button
                          onClick={toggleAppliedSort}
                          className="flex items-center gap-1.5 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                          title={appliedSort === 'asc' ? 'Oldest first (click to reverse)' : appliedSort === 'desc' ? 'Newest first (click to clear)' : 'Click to sort'}
                        >
                          <span>Recorded</span>
                          {appliedSort === 'asc' ? (
                            <ArrowUp className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          ) : appliedSort === 'desc' ? (
                            <ArrowDown className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                          ) : null}
                        </button>
                      </TableHead>
                      <TableHead className="hidden">
                        Resume
                      </TableHead>
                      <TableHead className="hidden">
                        JEV Classifier
                      </TableHead>
                      <TableHead className="text-sm font-semibold text-gray-700 dark:text-gray-300 relative w-[120px]">
                        <div className="flex items-center gap-2">
                          <span>Status</span>
                          <button
                            data-filter-button
                            onClick={() => setExpandedFilter(expandedFilter === 'status' ? null : 'status')}
                            className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-stone-700 transition-colors ${
                              statusFilter !== 'all' ? 'text-blue-600 dark:text-blue-400' : expandedFilter === 'status' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'
                            }`}
                            title="Filter by status"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {expandedFilter === 'status' && (
                          <div
                            ref={filterPopupRef}
                            className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-stone-800 border border-gray-300 dark:border-stone-600 rounded-lg shadow-lg p-3 min-w-[150px]"
                          >
                            <select
                              value={statusFilter}
                              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                              autoFocus
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-stone-600 rounded bg-white dark:bg-stone-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                              <option value="all">All Status</option>
                              <option value="needs-review">Needs Review</option>
                            </select>
                          </div>
                        )}
                      </TableHead>
                      <TableHead className="text-sm font-semibold text-gray-700 dark:text-gray-300 text-center relative w-[80px]">
                        <div className="flex items-center justify-center gap-2">
                          <span>Link</span>
                          <button
                            data-filter-button
                            onClick={() => setExpandedFilter(expandedFilter === 'link' ? null : 'link')}
                            className={`p-1 rounded hover:bg-gray-100 dark:hover:bg-stone-700 transition-colors ${
                              linkFilter !== 'all' ? 'text-blue-600 dark:text-blue-400' : expandedFilter === 'link' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'
                            }`}
                            title="Filter by link"
                          >
                            <Filter className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {expandedFilter === 'link' && (
                          <div
                            ref={filterPopupRef}
                            className="absolute top-full right-0 mt-1 z-50 bg-white dark:bg-stone-800 border border-gray-300 dark:border-stone-600 rounded-lg shadow-lg p-3 min-w-[150px]"
                          >
                            <select
                              value={linkFilter}
                              onChange={(e) => setLinkFilter(e.target.value as LinkFilter)}
                              autoFocus
                              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-stone-600 rounded bg-white dark:bg-stone-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                            >
                              <option value="all">All Links</option>
                              <option value="with-link">With Link</option>
                              <option value="no-link">No Link</option>
                            </select>
                          </div>
                        )}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      Loading applications...
                    </TableCell>
                  </TableRow>
                ) : filteredAndSortedApplications.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No applications found
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedApplications.map((app, index) => (
                    <>
                      <TableRow key={startIndex + index} className="border-gray-100 dark:border-stone-800 hover:bg-gray-50 dark:hover:bg-stone-800/50 transition-colors">
                        <TableCell className="font-medium capitalize text-sm w-[150px]">
                          <div className="truncate" title={app.company}>
                          {app.company}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm w-[200px]">
                          <div className="truncate" title={app.jobTitle}>{app.jobTitle}</div>
                        </TableCell>
                        <TableCell className="hidden">
                          <div className="line-clamp-2" title={app.jobDescription}>
                            {app.jobDescription}
                          </div>
                        </TableCell>
                        <TableCell className="hidden">
                          <div className="truncate" title={formatPostedTime(app.postedTime)}>
                          {formatPostedTime(app.postedTime)}
                          </div>
                        </TableCell>
                        <TableCell className="hidden">
                          <div className="truncate" title={formatDate(app.applicationTime)}>
                          {formatDate(app.applicationTime)}
                          </div>
                        </TableCell>
                        <TableCell className="hidden">
                          <select
                            value={app.resume || ''}
                            onChange={(event) => assignResume(app, event.target.value || null)}
                            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 dark:border-stone-600 dark:bg-stone-800 dark:text-gray-100"
                            aria-label={`Resume for ${app.jobTitle} at ${app.company}`}
                          >
                            <option value="">Select resume</option>
                            {resumes.map(resume => <option key={resume.name} value={resume.name}>{resume.name}</option>)}
                          </select>
                        </TableCell>
                        <TableCell className="hidden">
                          <div className="space-y-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runJevClassifier(app)}
                              disabled={classifying === `${app.applicationTime}:${app.job_link}`}
                            >
                              {classifying === `${app.applicationTime}:${app.job_link}` ? 'Classifying...' : 'Run JEV'}
                            </Button>
                            {app.jevClassification && (
                              <p className="truncate text-xs text-gray-600 dark:text-gray-400" title={app.jevClassification.choice}>
                                Choice: {app.jevClassification.choice}
                                {typeof app.jevClassification.confidence === 'number' ? ` (${Math.round(app.jevClassification.confidence * 100)}%)` : ''}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="w-[120px]">
                          <span className="inline-flex items-center rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300 font-medium px-2.5 py-1 text-xs">
                            Needs Review
                          </span>
                        </TableCell>
                        <TableCell className="w-[80px]">
                          <div className="flex items-center justify-end gap-3">
                            {app.job_link ? (
                              <a
                                href={app.job_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                                title={app.job_link}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            ) : (
                              <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleApplication(app)}
                              className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-stone-700 dark:hover:text-gray-100"
                              aria-label={`${expandedApplications.has(applicationKey(app)) ? 'Collapse' : 'Expand'} details for ${app.jobTitle}`}
                            >
                              {expandedApplications.has(applicationKey(app)) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedApplications.has(applicationKey(app)) && (
                        <TableRow className="bg-gray-50/80 dark:bg-stone-900/60">
                          <TableCell colSpan={4} className="px-6 py-5">
                            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
                              <section>
                                <h3 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">Job description</h3>
                                <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-gray-200 bg-white p-4 text-sm leading-6 text-gray-700 dark:border-stone-700 dark:bg-stone-800 dark:text-gray-300">
                                  {app.jobDescription || 'No job description available.'}
                                </div>
                                <div className="mt-3 grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
                                  <div>Posted: {formatDate(app.postedTime)}</div>
                                  <div>Recorded: {formatDate(app.applicationTime)}</div>
                                </div>
                              </section>
                              <section>
                                <div className="mb-3 rounded-md border border-gray-200 bg-white p-3 dark:border-stone-700 dark:bg-stone-800">
                                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Recommended resume</p>
                                  <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    {app.jevClassification?.choice || app.resume || 'Run JEV to get a recommendation'}
                                  </p>
                                </div>
                                <Button size="sm" variant="outline" onClick={() => runJevClassifier(app)} disabled={classifying === applicationKey(app)}>
                                  {classifying === applicationKey(app) ? 'Classifying...' : 'Run JEV'}
                                </Button>
                                {app.jevClassification && (
                                  <div className="mt-3 space-y-3">
                                    <details className="rounded-md border border-gray-200 dark:border-stone-700">
                                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Request payload</summary>
                                      <pre className="max-h-72 overflow-auto border-t border-gray-200 bg-gray-950 p-3 text-[11px] text-green-200 dark:border-stone-700">{formatPayload(app.jevClassification.requestPayload)}</pre>
                                    </details>
                                    <details className="rounded-md border border-gray-200 dark:border-stone-700">
                                      <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Response payload</summary>
                                      <pre className="max-h-72 overflow-auto border-t border-gray-200 bg-gray-950 p-3 text-[11px] text-green-200 dark:border-stone-700">{formatPayload(app.jevClassification.responsePayload)}</pre>
                                    </details>
                                  </div>
                                )}
                              </section>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))
                )}
                  </TableBody>
                </Table>
              </div>
              {/* Pagination */}
          {!isLoading && filteredAndSortedApplications.length > 0 && totalPages > 1 && (
                <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200 dark:border-stone-700">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Page {currentPage} of {totalPages}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-stone-800 border border-gray-300 dark:border-stone-600 rounded-lg hover:bg-gray-50 dark:hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-stone-800 border border-gray-300 dark:border-stone-600 rounded-lg hover:bg-gray-50 dark:hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
