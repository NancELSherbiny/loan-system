import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Divider,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'
import { apiRequest, formatDateInput } from '../apiClient'
import { JsonResultCard } from './JsonResultCard'

export const RepaymentConsole = () => {
  const today = useMemo(() => formatDateInput(new Date()), [])

  const [loanId, setLoanId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(today)
  const [historyFrom, setHistoryFrom] = useState('')
  const [historyTo, setHistoryTo] = useState('')
  const [calculateAsOf, setCalculateAsOf] = useState(today)

  const [historyData, setHistoryData] = useState<unknown>(null)
  const [scheduleData, setScheduleData] = useState<unknown>(null)
  const [calcData, setCalcData] = useState<unknown>(null)
  const [paymentData, setPaymentData] = useState<unknown>(null)

  const [historyError, setHistoryError] = useState<string | null>(null)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [calcError, setCalcError] = useState<string | null>(null)
  const [paymentError, setPaymentError] = useState<string | null>(null)

  const [historyLoading, setHistoryLoading] = useState(false)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [calcLoading, setCalcLoading] = useState(false)
  const [paymentLoading, setPaymentLoading] = useState(false)

  const fetchHistory = async () => {
    if (!loanId.trim()) {
      setHistoryError('Loan ID required')
      return
    }
    setHistoryLoading(true)
    setHistoryError(null)
    setHistoryData(null)
    const params = new URLSearchParams()
    if (historyFrom) params.set('from', historyFrom)
    if (historyTo) params.set('to', historyTo)
    try {
      const data = await apiRequest(`/api/repayments/${loanId.trim()}?${params.toString()}`)
      setHistoryData(data)
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Failed to load history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const fetchSchedule = async () => {
    if (!loanId.trim()) {
      setScheduleError('Loan ID required')
      return
    }
    setScheduleLoading(true)
    setScheduleError(null)
    setScheduleData(null)
    try {
      const data = await apiRequest(`/api/repayments/${loanId.trim()}/schedule`)
      setScheduleData(data)
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : 'Failed to load schedule')
    } finally {
      setScheduleLoading(false)
    }
  }

  const fetchCalculation = async () => {
    if (!loanId.trim()) {
      setCalcError('Loan ID required')
      return
    }
    setCalcLoading(true)
    setCalcError(null)
    setCalcData(null)
    const params = new URLSearchParams()
    if (calculateAsOf) params.set('asOf', calculateAsOf)
    try {
      const data = await apiRequest(`/api/repayments/${loanId.trim()}/calculate?${params.toString()}`)
      setCalcData(data)
    } catch (error) {
      setCalcError(error instanceof Error ? error.message : 'Failed to calculate balance')
    } finally {
      setCalcLoading(false)
    }
  }

  const submitPayment = async () => {
    if (!loanId.trim()) {
      setPaymentError('Loan ID required')
      return
    }
    setPaymentLoading(true)
    setPaymentError(null)
    setPaymentData(null)
    try {
      const data = await apiRequest('/api/repayments', {
        method: 'POST',
        body: JSON.stringify({
          loanId: loanId.trim(),
          amount: Number(paymentAmount),
          paymentDate,
        }),
      })
      setPaymentData(data)
    } catch (error) {
      setPaymentError(error instanceof Error ? error.message : 'Failed to post repayment')
    } finally {
      setPaymentLoading(false)
    }
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h6">Repayment console</Typography>
            <Typography variant="body2" color="text.secondary">
              Retrieve repayment history, inspect the system-generated schedule, or book a manual payment.
            </Typography>
          </Box>

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                label="Loan ID"
                value={loanId}
                onChange={(event) => setLoanId(event.target.value)}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Payment amount"
                type="number"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Payment date"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <Button variant="contained" onClick={submitPayment} disabled={paymentLoading}>
                Post repayment
              </Button>
            </Grid>
          </Grid>

          <Divider />

          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                label="History from"
                type="date"
                value={historyFrom}
                onChange={(event) => setHistoryFrom(event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="History to"
                type="date"
                value={historyTo}
                onChange={(event) => setHistoryTo(event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>
            <Grid
              item
              xs={12}
              md={4}
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}
            >
              <Button variant="outlined" onClick={fetchHistory} disabled={historyLoading}>
                Fetch history
              </Button>
            </Grid>
          </Grid>

          <Button variant="outlined" onClick={fetchSchedule} disabled={scheduleLoading}>
            View repayment schedule
          </Button>

          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Calculate as of"
                type="date"
                value={calculateAsOf}
                onChange={(event) => setCalculateAsOf(event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6} sx={{ display: 'flex', alignItems: 'center' }}>
              <Button variant="outlined" onClick={fetchCalculation} disabled={calcLoading}>
                Calculate due amount
              </Button>
            </Grid>
          </Grid>

          <JsonResultCard
            title="Repayment history"
            data={historyData}
            error={historyError}
            loading={historyLoading}
          />
          <JsonResultCard
            title="Repayment schedule"
            data={scheduleData}
            error={scheduleError}
            loading={scheduleLoading}
          />
          <JsonResultCard title="Amount due" data={calcData} error={calcError} loading={calcLoading} />
          <JsonResultCard
            title="Last payment response"
            data={paymentData}
            error={paymentError}
            loading={paymentLoading}
          />
        </Stack>
      </CardContent>
    </Card>
  )
}


