import { useState } from 'react'
import { Box, Button, Card, CardContent, Stack, TextField, Typography } from '@mui/material'
import Grid from '@mui/material/Grid'
import { apiRequest } from '../apiClient'
import { JsonResultCard } from './JsonResultCard'

type LoanResponse = Record<string, unknown> | null

type AuditEntry = Record<string, unknown>

export const LoanExplorer = () => {
  const [loanId, setLoanId] = useState('')
  const [loan, setLoan] = useState<LoanResponse>(null)
  const [auditTrail, setAuditTrail] = useState<AuditEntry[] | null>(null)
  const [loanError, setLoanError] = useState<string | null>(null)
  const [auditError, setAuditError] = useState<string | null>(null)
  const [loadingLoan, setLoadingLoan] = useState(false)
  const [loadingAudit, setLoadingAudit] = useState(false)

  const fetchLoan = async () => {
    if (!loanId.trim()) {
      setLoanError('Loan ID is required')
      return
    }
    setLoanError(null)
    setLoadingLoan(true)
    setLoan(null)
    try {
      const data = await apiRequest<LoanResponse>(`/api/loans/${loanId.trim()}`)
      setLoan(data)
      fetchAudit()
    } catch (error) {
      setLoanError(error instanceof Error ? error.message : 'Failed to fetch loan')
    } finally {
      setLoadingLoan(false)
    }
  }

  const fetchAudit = async () => {
    setAuditTrail(null)
    setAuditError(null)
    if (!loanId.trim()) {
      return
    }
    setLoadingAudit(true)
    try {
      const data = await apiRequest<AuditEntry[]>(`/api/loans/${loanId.trim()}/audit-trail`)
      setAuditTrail(data)
    } catch (error) {
      setAuditError(error instanceof Error ? error.message : 'Failed to load audit trail')
    } finally {
      setLoadingAudit(false)
    }
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h6" gutterBottom>
              Loan explorer
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Fetch the latest loan snapshot and its audit trail directly from the Nest backend.
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Loan ID"
                value={loanId}
                onChange={(event) => setLoanId(event.target.value)}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Button variant="contained" onClick={fetchLoan} fullWidth sx={{ height: '100%' }}>
                Fetch loan
              </Button>
            </Grid>
            <Grid item xs={12} md={3}>
              <Button variant="outlined" onClick={fetchAudit} fullWidth sx={{ height: '100%' }}>
                Refresh audit trail
              </Button>
            </Grid>
          </Grid>

          <JsonResultCard
            title="Loan details"
            data={loan}
            error={loanError}
            loading={loadingLoan}
            emptyLabel="Retrieve a loan to view details."
          />
          <JsonResultCard
            title="Audit timeline"
            data={auditTrail}
            error={auditError}
            loading={loadingAudit}
            emptyLabel="Fetch a loan to view its audit history."
          />
        </Stack>
      </CardContent>
    </Card>
  )
}


