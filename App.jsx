import { useState } from "react"
import AuthProvider from "./components/AuthProvider"
import JobList from "./pages/JobList"
import JobDetail from "./pages/JobDetail"
import "./index.css"

function Router() {
  const [page, setPage] = useState("jobs")
  const [job, setJob]   = useState(null)

  const goJob  = (j) => { setJob(j); setPage("detail") }
  const goBack = ()  => { setJob(null); setPage("jobs") }

  return page === "jobs"
    ? <JobList onSelect={goJob} />
    : <JobDetail job={job} onBack={goBack} />
}

export default function App() {
  return <AuthProvider><Router /></AuthProvider>
}
