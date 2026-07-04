async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  getHealth: () => request("/api/health"),
  getConfig: () => request("/api/config"),
  getSettingsEnv: () => request("/api/settings/env"),
  saveSettingsEnv: (values) => request("/api/settings/env", { method: "POST", body: JSON.stringify({ values }) }),
  getProducts: () => request("/api/products"),

  getProspects: () => request("/api/prospects"),
  getPossibleClients: (limit) => request(`/api/prospects/possible-clients?limit=${limit || 100}`),
  queryProspects: (params) => {
    const query = new URLSearchParams(params || {}).toString();
    const url = query ? `/api/prospects/query?${query}` : "/api/prospects/query";
    return request(url);
  },
  getProspectExportUrl: (params) => {
    const query = new URLSearchParams(params || {}).toString();
    return query ? `/api/prospects/export.csv?${query}` : "/api/prospects/export.csv";
  },
  createProspect: (data) => request("/api/prospects", { method: "POST", body: JSON.stringify(data) }),
  updateProspect: (id, data) => request(`/api/prospects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProspect: (id) => request(`/api/prospects/${id}`, { method: "DELETE" }),
  generateAiEmailDraft: (data) => request("/api/ai/email-draft", { method: "POST", body: JSON.stringify(data) }),

  getCampaigns: () => request("/api/campaigns"),
  createCampaign: (data) => request("/api/campaigns", { method: "POST", body: JSON.stringify(data) }),
  sendCampaign: (id, data) => request(`/api/campaigns/${id}/send`, { method: "POST", body: JSON.stringify(data || {}) }),
  launchCampaignSequence: (id) => request(`/api/campaigns/${id}/launch-sequence`, { method: "POST" }),

  getInquiries: () => request("/api/inquiries"),
  createInquiry: (data) => request("/api/inquiries", { method: "POST", body: JSON.stringify(data) }),
  replyInquiry: (id) => request(`/api/inquiries/${id}/reply`, { method: "POST" }),

  getProposals: () => request("/api/proposals"),
  createProposal: (data) => request("/api/proposals", { method: "POST", body: JSON.stringify(data) }),

  getDemos: () => request("/api/demos"),
  createDemo: (data) => request("/api/demos", { method: "POST", body: JSON.stringify(data) }),

  getAnalytics: (params) => {
    const query = new URLSearchParams(params || {}).toString();
    return request(query ? `/api/analytics?${query}` : "/api/analytics");
  },
  getActivity: (params) => {
    const query = new URLSearchParams(params || {}).toString();
    return request(query ? `/api/activity?${query}` : "/api/activity");
  },
  updateActivity: (id, data) => request(`/api/activity/${id}`, { method: "PATCH", body: JSON.stringify(data || {}) }),
  deleteActivity: (id) => request(`/api/activity/${id}`, { method: "DELETE" }),
  pruneActivity: (keepLast) => request("/api/activity/prune", { method: "POST", body: JSON.stringify({ keepLast }) }),
  getIntegrationStatus: () => request("/api/integrations/status"),
  getEmailJobs: () => request("/api/email-jobs"),
  processEmailJobs: (data) => request("/api/email-jobs/process", { method: "POST", body: JSON.stringify(data || {}) }),

  discoverCompanies: (data) => request("/api/discovery/companies", { method: "POST", body: JSON.stringify(data) }),
  detectWebsiteTech: (data) => request("/api/discovery/tech-detect", { method: "POST", body: JSON.stringify(data) }),
  bulkGenerateProspects: (data) => request("/api/prospects/bulk-generate", { method: "POST", body: JSON.stringify(data) }),

  getSalesAssets: () => request("/api/sales-package/assets"),
  getMarketingCalendar: (year) => request(`/api/sales-package/calendar?year=${year || new Date().getFullYear()}`),
  getEmailSequence: (product, role) => request(`/api/sales-package/sequence?product=${encodeURIComponent(product || "")}&role=${encodeURIComponent(role || "")}`),

  getAiAutomationStatus: () => request("/api/ai/automation/status"),
  saveAiAutomationSettings: (data) => request("/api/ai/automation/settings", { method: "POST", body: JSON.stringify(data || {}) }),
  runAiAutomation: (data) => request("/api/ai/automation/run", { method: "POST", body: JSON.stringify(data || {}) }),
  getPipelineRecommendations: (limit) => request(`/api/ai/pipeline-recommendations?limit=${limit || 12}`)
};
