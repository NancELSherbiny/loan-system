const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

export const getAuthToken = () => localStorage.getItem('authToken') || ''

export const setAuthToken = (token: string) => {
  if (token) {
    localStorage.setItem('authToken', token)
  } else {
    localStorage.removeItem('authToken')
  }
}

type RequestOptions = RequestInit & {
  skipAuth?: boolean
}

export const apiRequest = async <T>(path: string, options: RequestOptions = {}) => {
  const { skipAuth, headers, ...rest } = options
  const token = getAuthToken()

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      'Content-Type': 'application/json',
      ...(!skipAuth && token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  })

  const data = (await response.json().catch(() => null)) as T | { message?: string } | null

  if (!response.ok) {
    const message =
      (data && 'message' in data && data.message) ||
      response.statusText ||
      'Request failed'
    throw new Error(message)
  }

  return data as T
}

export const formatDateInput = (date: Date) => date.toISOString().split('T')[0]

export const formatDateTime = (date: Date) => date.toISOString().slice(0, 19)


