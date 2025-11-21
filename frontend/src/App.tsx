import { useState } from 'react'
import {
  Box,
  Container,
  CssBaseline,
  Tab,
  Tabs,
  ThemeProvider,
  Typography,
  createTheme,
} from '@mui/material'
import { LoanExplorer } from './components/LoanExplorer'
import { DisbursementWorkbench } from './components/DisbursementWorkbench'
import { RepaymentConsole } from './components/RepaymentConsole'
import { TokenBanner } from './components/TokenBanner'

const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#f7f9fc',
    },
  },
})

const App = () => {
  const [tab, setTab] = useState(0)

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', py: { xs: 4, md: 6 } }}>
        <Container maxWidth="lg">
          <Typography variant="h4" gutterBottom>
          Loan Disbursement & Repayment System
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 4, maxWidth: 720 }}>
            fetch loans, trigger disbursements, and inspect repayment activity 
          </Typography>

          <TokenBanner />

          <Tabs
            value={tab}
            onChange={(_, value) => setTab(value)}
            variant="scrollable"
            allowScrollButtonsMobile
            sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
          >
            <Tab label="Loans" />
            <Tab label="Disbursements" />
            <Tab label="Repayments" />
          </Tabs>

          {tab === 0 && <LoanExplorer />}
          {tab === 1 && <DisbursementWorkbench />}
          {tab === 2 && <RepaymentConsole />}
        </Container>
      </Box>
    </ThemeProvider>
  )
}

export default App
