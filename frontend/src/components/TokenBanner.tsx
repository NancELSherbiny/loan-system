import { useState } from 'react'
import { Alert, Box, Button, Stack, TextField, Typography } from '@mui/material'
import { getAuthToken, setAuthToken } from '../apiClient'

export const TokenBanner = () => {
  const [token, setToken] = useState(getAuthToken())
  const [feedback, setFeedback] = useState<string | null>(null)

  const handleSave = () => {
    setAuthToken(token.trim())
    setFeedback('Saved authentication token.')
    setTimeout(() => setFeedback(null), 2500)
  }

  const handleClear = () => {
    setToken('')
    setAuthToken('')
    setFeedback('Cleared authentication token.')
    setTimeout(() => setFeedback(null), 2500)
  }

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="subtitle1" gutterBottom>
        API authentication
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          label="JWT Bearer token"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          fullWidth
          size="small"
        />
        <Button variant="contained" onClick={handleSave}>
          Save
        </Button>
        <Button variant="text" color="inherit" onClick={handleClear}>
          Clear
        </Button>
      </Stack>
      {feedback && (
        <Alert severity="success" sx={{ mt: 2 }}>
          {feedback}
        </Alert>
      )}
      {!token && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Enter a JWT from the backend’s auth flow to unlock the secured endpoints.
        </Alert>
      )}
    </Box>
  )
}


