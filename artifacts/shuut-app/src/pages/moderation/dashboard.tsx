import { useState } from "react";
import { Link, useLocation } from "wouter";
import { formatDistanceToNow, format } from "date-fns";
import { ModerationLayout } from "./layout";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertTriangle, Clock, ShieldAlert, FileText } from "lucide-react";
import { 
  useListModerationCases, 
  ListModerationCasesStatus, 
  ListModerationCasesPriority,
  useListModerationAppeals,
  getListModerationCasesQueryKey,
  getListModerationAppealsQueryKey
} from "@workspace/api-client-react";

export default function ModerationDashboard() {
  const [location] = useLocation();
  const isAppealsTab = location === "/moderation/appeals";

  const [status, setStatus] = useState<ListModerationCasesStatus>("open");
  const [priority, setPriority] = useState<ListModerationCasesPriority | "all">("all");
  
  const queryParams: any = { status };
  if (priority !== "all") queryParams.priority = priority;
  
  const { data: casesData, isLoading: casesLoading } = useListModerationCases(queryParams, {
    query: { 
      enabled: !isAppealsTab,
      queryKey: getListModerationCasesQueryKey(queryParams)
    }
  });

  const { data: appealsData, isLoading: appealsLoading } = useListModerationAppeals({
    query: { 
      enabled: isAppealsTab,
      queryKey: getListModerationAppealsQueryKey()
    }
  });

  return (
    <ModerationLayout>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Queue</h1>
        
        {!isAppealsTab && (
          <div className="flex flex-wrap items-center gap-3">
            <Select value={status} onValueChange={(v) => setStatus(v as ListModerationCasesStatus)}>
              <SelectTrigger className="w-[140px] h-9" data-testid="select-status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="appealed">Appealed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={priority} onValueChange={(v) => setPriority(v as ListModerationCasesPriority | "all")}>
              <SelectTrigger className="w-[140px] h-9" data-testid="select-priority">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Tabs value={isAppealsTab ? "appeals" : "cases"} className="w-full">
        <div className="mb-6 border-b border-border/50">
          <TabsList className="bg-transparent h-auto p-0">
            <TabsTrigger 
              value="cases" 
              asChild
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 font-medium"
            >
              <Link href="/moderation">Cases</Link>
            </TabsTrigger>
            <TabsTrigger 
              value="appeals" 
              asChild
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-2 font-medium"
            >
              <Link href="/moderation/appeals">Appeals</Link>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="cases" className="mt-0 outline-none">
          {casesLoading ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !casesData || casesData.cases.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card shadow-sm text-muted-foreground">
              <ShieldAlert className="h-8 w-8 opacity-20" />
              <p className="text-sm font-medium">No cases found in this view.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Case ID</th>
                      <th className="px-4 py-3 font-medium">Target</th>
                      <th className="px-4 py-3 font-medium">Priority</th>
                      <th className="px-4 py-3 font-medium">Age</th>
                      <th className="px-4 py-3 font-medium">SLA</th>
                      <th className="px-4 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {casesData.cases.map((c) => (
                      <tr key={c.id} className="transition-colors hover:bg-secondary/20">
                        <td className="px-4 py-3 font-mono font-medium">#{c.id}</td>
                        <td className="px-4 py-3">
                          <span className="capitalize font-medium text-foreground">{c.targetType}</span>
                          <span className="ml-1 text-muted-foreground">#{c.targetId}</span>
                        </td>
                        <td className="px-4 py-3">
                          {c.priority === "high" ? (
                            <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                              <AlertTriangle className="h-3 w-3" /> High
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                              Normal
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.ageHours}h
                        </td>
                        <td className="px-4 py-3">
                          {c.overdue ? (
                            <span className="inline-flex items-center gap-1 text-destructive font-medium">
                              <Clock className="h-3 w-3" /> Overdue
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {c.slaHours - c.ageHours}h left
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button asChild variant="outline" size="sm" className="h-8" data-testid={`button-review-case-${c.id}`}>
                            <Link href={`/moderation/cases/${c.id}`}>Review</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="appeals" className="mt-0 outline-none">
          {appealsLoading ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-card shadow-sm">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !appealsData || appealsData.appeals.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-card shadow-sm text-muted-foreground">
              <FileText className="h-8 w-8 opacity-20" />
              <p className="text-sm font-medium">No open appeals.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-secondary/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 font-medium">Appeal ID</th>
                      <th className="px-4 py-3 font-medium">Case ID</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {appealsData.appeals.map((a) => (
                      <tr key={a.id} className="transition-colors hover:bg-secondary/20">
                        <td className="px-4 py-3 font-mono font-medium">#{a.id}</td>
                        <td className="px-4 py-3 font-mono text-muted-foreground">#{a.caseId}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {format(new Date(a.createdAt), 'MMM d, HH:mm')}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground uppercase">
                            {a.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button asChild variant="outline" size="sm" className="h-8" data-testid={`button-review-appeal-${a.id}`}>
                            <Link href={`/moderation/appeals/${a.id}`}>Review</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </ModerationLayout>
  );
}
