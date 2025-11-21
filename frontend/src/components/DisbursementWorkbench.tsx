import { useMemo, useState } from 'react'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import Grid from '@mui/material/Grid'
import { apiRequest, formatDateInput } from '../apiClient'
import { JsonResultCard } from './JsonResultCard'

type DisbursementPayload = {
  loanId: string
  borrowerId: string
  amount: string
  currency: string
  disbursementDate: string
  firstPaymentDate: string
  tenor: string
  interestRate: string
}

type DisbursementRecord = {
  id: string
  loanId: string
  amount: number
  status: string
  disbursementDate: string
  createdAt?: string
  rolledBackAt?: string | null
}

type Operation = 'create' | 'lookup' | 'rollback'

const defaultFirstPaymentDate = () => {
  const date = new Date()
  date.setMonth(date.getMonth() + 1)
  return formatDateInput(date)
}

const coerceNumber = (value: unknown) => {
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

const toDisbursementRecord = (data: unknown): DisbursementRecord | null => {
  if (!data || typeof data !== 'object') return null
  const record = data as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.loanId !== 'string' || typeof record.status !== 'string') {
    return null
  }
  const amount = coerceNumber(record.amount)
  if (amount === null) {
    return null
  }
  if (typeof record.disbursementDate !== 'string') {
    return null
  }
  return {
    id: record.id,
    loanId: record.loanId,
    amount,
    status: record.status,
    disbursementDate: record.disbursementDate,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined,
    rolledBackAt: typeof record.rolledBackAt === 'string' ? record.rolledBackAt : null,
  }
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleString()
}

const formatAmount = (amount: number, currency = 'USD') =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount)

const emptyErrors: Partial<Record<keyof DisbursementPayload, string>> = {}

export const DisbursementWorkbench = () => {
  const today = useMemo(() => formatDateInput(new Date()), [])
  const firstPaymentDefault = useMemo(() => defaultFirstPaymentDate(), [])
  const [tab, setTab] = useState(0)
  const [createForm, setCreateForm] = useState<DisbursementPayload>({
    loanId: '',
    borrowerId: '',
    amount: '',
    currency: 'USD',
    disbursementDate: today,
    firstPaymentDate: firstPaymentDefault,
    tenor: '12',
    interestRate: '10',
  })
  const [formErrors, setFormErrors] = useState(emptyErrors)
  const [lookupId, setLookupId] = useState('')
  const [rollbackId, setRollbackId] = useState('')
  const [rollbackReason, setRollbackReason] = useState('')

  const [operation, setOperation] = useState<Operation>('create')
  const [response, setResponse] = useState<unknown>(null)
  const [disbursement, setDisbursement] = useState<DisbursementRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const validateCreateForm = () => {
    const errors: Partial<Record<keyof DisbursementPayload, string>> = {}
    if (!createForm.loanId.trim()) errors.loanId = 'Loan ID is required'
    if (!createForm.borrowerId.trim()) errors.borrowerId = 'Borrower ID is required'

    const amount = Number(createForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter a positive amount'

    if (!createForm.currency.trim()) errors.currency = 'Currency is required'

    const tenor = Number(createForm.tenor)
    if (!Number.isInteger(tenor) || tenor <= 0) errors.tenor = 'Tenor must be a positive integer'

    const interestRate = Number(createForm.interestRate)
    if (!Number.isFinite(interestRate) || interestRate < 0) errors.interestRate = 'Interest must be zero or positive'

    if (!createForm.disbursementDate) errors.disbursementDate = 'Pick a disbursement date'
    if (!createForm.firstPaymentDate) {
      errors.firstPaymentDate = 'Pick a first payment date'
    } else if (createForm.firstPaymentDate < createForm.disbursementDate) {
      errors.firstPaymentDate = 'First payment must be after the disbursement'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const run = async (action: () => Promise<unknown>, op: Operation) => {
    setLoading(true)
    setOperation(op)
    setError(null)
    setResponse(null)
    try {
      const result = await action()
      setResponse(result)
      const parsed = toDisbursementRecord(result)
      setDisbursement(parsed)
      if (parsed) {
        setLookupId(parsed.id)
        setRollbackId(parsed.id)
      }
    } catch (err) {
      setDisbursement(null)
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = () => {
    if (!validateCreateForm()) {
      return
    }
    const payload = {
      loanId: createForm.loanId.trim(),
      borrowerId: createForm.borrowerId.trim(),
      amount: Number(createForm.amount),
      currency: createForm.currency.trim().toUpperCase(),
      disbursementDate: createForm.disbursementDate,
      firstPaymentDate: createForm.firstPaymentDate,
      tenor: Number(createForm.tenor),
      interestRate: Number(createForm.interestRate),
    }
    run(
      () =>
        apiRequest('/api/disbursements', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),
      'create',
    )
  }

  const handleLookup = () => {
    if (!lookupId.trim()) {
      setError('Enter a disbursement ID before searching')
      return
    }
    run(() => apiRequest(`/api/disbursements/${lookupId.trim()}`), 'lookup')
  }

  const handleRollback = () => {
    if (!rollbackId.trim()) {
      setError('Enter a disbursement ID to roll back')
      return
    }
    if (!rollbackReason.trim()) {
      setError('Provide a rollback reason')
      return
    }
    run(
      () =>
        apiRequest(`/api/disbursements/${rollbackId.trim()}/rollback`, {
          method: 'POST',
          body: JSON.stringify({ reason: rollbackReason.trim() }),
        }),
      'rollback',
    )
  }

  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Disbursement workbench
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Run the Nest disbursement flows end-to-end with a friendlier UI.
        </Typography>

        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab label="Create" />
          <Tab label="Lookup" />
          <Tab label="Rollback" />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ mt: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Loan ID"
                  value={createForm.loanId}
                  onChange={(event) => setCreateForm({ ...createForm, loanId: event.target.value })}
                  fullWidth
                  required
                  error={Boolean(formErrors.loanId)}
                  helperText={formErrors.loanId ?? 'UUID from the loans table'}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Borrower ID"
                  value={createForm.borrowerId}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, borrowerId: event.target.value })
                  }
                  fullWidth
                  required
                  error={Boolean(formErrors.borrowerId)}
                  helperText={formErrors.borrowerId ?? 'Must match the loan record'}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Amount"
                  type="number"
                  value={createForm.amount}
                  onChange={(event) => setCreateForm({ ...createForm, amount: event.target.value })}
                  fullWidth
                  required
                  error={Boolean(formErrors.amount)}
                  helperText={formErrors.amount ?? 'Principal amount to disburse'}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Currency"
                  value={createForm.currency}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, currency: event.target.value.toUpperCase() })
                  }
                  fullWidth
                  required
                  error={Boolean(formErrors.currency)}
                  helperText={formErrors.currency ?? 'ISO 4217 code (USD, GHS, NGN...)'}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Interest rate (%)"
                  type="number"
                  value={createForm.interestRate}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, interestRate: event.target.value })
                  }
                  fullWidth
                  required
                  error={Boolean(formErrors.interestRate)}
                  helperText={formErrors.interestRate ?? 'Annual nominal rate'}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Tenor (months)"
                  type="number"
                  value={createForm.tenor}
                  onChange={(event) => setCreateForm({ ...createForm, tenor: event.target.value })}
                  fullWidth
                  required
                  error={Boolean(formErrors.tenor)}
                  helperText={formErrors.tenor ?? 'Number of installments to generate'}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="Disbursement date"
                  type="date"
                  value={createForm.disbursementDate}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, disbursementDate: event.target.value })
                  }
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  required
                  error={Boolean(formErrors.disbursementDate)}
                  helperText={formErrors.disbursementDate ?? 'Date funds leave your account'}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  label="First payment date"
                  type="date"
                  value={createForm.firstPaymentDate}
                  onChange={(event) =>
                    setCreateForm({ ...createForm, firstPaymentDate: event.target.value })
                  }
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                  required
                  error={Boolean(formErrors.firstPaymentDate)}
                  helperText={formErrors.firstPaymentDate ?? 'Start date for the repayment schedule'}
                />
              </Grid>
            </Grid>
            <Button
              sx={{ mt: 3 }}
              variant="contained"
              onClick={handleCreate}
              disabled={loading}
              endIcon={loading ? <CircularProgress size={16} /> : undefined}
            >
              Trigger disbursement
            </Button>
          </Box>
        )}

        {tab === 1 && (
          <Box sx={{ mt: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={8}>
                <TextField
                  label="Disbursement ID"
                  value={lookupId}
                  onChange={(event) => setLookupId(event.target.value)}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <Button
                  fullWidth
                  sx={{ height: '100%' }}
                  variant="contained"
                  onClick={handleLookup}
                  disabled={loading}
                >
                  Fetch disbursement
                </Button>
              </Grid>
            </Grid>
          </Box>
        )}

        {tab === 2 && (
          <Box sx={{ mt: 3 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Disbursement ID"
                  value={rollbackId}
                  onChange={(event) => setRollbackId(event.target.value)}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Reason"
                  value={rollbackReason}
                  onChange={(event) => setRollbackReason(event.target.value)}
                  fullWidth
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <Button
                  variant="contained"
                  color="error"
                  onClick={handleRollback}
                  disabled={loading}
                >
                  Mark as rolled back
                </Button>
              </Grid>
            </Grid>
          </Box>
        )}

        {disbursement && (
          <>
            <Divider sx={{ my: 3 }} />
            <Card variant="outlined" sx={{ bgcolor: 'grey.50' }}>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  spacing={2}
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="subtitle1">Latest disbursement</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Loan {disbursement.loanId}
                    </Typography>
                    <Typography variant="h6" sx={{ mt: 1 }}>
                      {formatAmount(disbursement.amount, createForm.currency || 'USD')}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1}>
                    <Chip
                      label={disbursement.status}
                      color={
                        disbursement.status === 'ROLLED_BACK'
                          ? 'error'
                          : disbursement.status === 'COMPLETED'
                            ? 'success'
                            : 'default'
                      }
                      size="small"
                    />
                    <Chip label={`ID: ${disbursement.id.slice(0, 8)}…`} size="small" />
                  </Stack>
                </Stack>
                <Grid container spacing={2} sx={{ mt: 2 }}>
                  <Grid item xs={12} md={4}>
                    <Typography variant="caption" color="text.secondary">
                      Disbursed on
                    </Typography>
                    <Typography>{formatDateTime(disbursement.disbursementDate)}</Typography>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Typography variant="caption" color="text.secondary">
                      Created at
                    </Typography>
                    <Typography>{formatDateTime(disbursement.createdAt)}</Typography>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Typography variant="caption" color="text.secondary">
                      Rolled back at
                    </Typography>
                    <Typography>{formatDateTime(disbursement.rolledBackAt)}</Typography>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </>
        )}

        <JsonResultCard
          title={`Disbursement ${operation} response`}
          data={response}
          error={error}
          loading={loading}
        />
      </CardContent>
    </Card>
  )
}


