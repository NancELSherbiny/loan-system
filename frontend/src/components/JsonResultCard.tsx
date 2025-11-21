import { Alert, Card, CardContent, CircularProgress, Typography } from '@mui/material'

type JsonResultCardProps = {
  title: string
  data?: unknown
  error?: string | null
  loading?: boolean
  emptyLabel?: string
}

export const JsonResultCard = ({
  title,
  data,
  error,
  loading,
  emptyLabel = 'No data loaded yet.',
}: JsonResultCardProps) => (
  <Card variant="outlined" sx={{ mt: 2 }}>
    <CardContent>
      <Typography variant="h6" gutterBottom>
        {title}
      </Typography>
      {loading ? (
        <CircularProgress size={24} />
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : data ? (
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 14,
          }}
        >
          {JSON.stringify(data, null, 2)}
        </pre>
      ) : (
        <Typography color="text.secondary">{emptyLabel}</Typography>
      )}
    </CardContent>
  </Card>
)


