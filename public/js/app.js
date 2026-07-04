import { api } from "./api.js";

function byId(id) {
  return document.getElementById(id);
}

function setNotice(containerId, message, type = "success") {
  const el = byId(containerId);
  if (!el) {
    return;
  }

  if (!message) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = `<div class="alert ${type}">${message}</div>`;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(amount || 0));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSelectedRowIds(tableBodyId) {
  const body = byId(tableBodyId);
  if (!body) {
    return [];
  }

  return Array.from(body.querySelectorAll("input[data-row-id]:checked"))
    .map((input) => input.dataset.rowId)
    .filter(Boolean);
}

function setAllRowsSelected(tableBodyId, selected) {
  const body = byId(tableBodyId);
  if (!body) {
    return;
  }

  body.querySelectorAll("input[data-row-id]").forEach((input) => {
    input.checked = Boolean(selected);
  });
}

function safeConfirm(message) {
  try {
    return typeof globalThis.confirm === "function" ? globalThis.confirm(message) : true;
  } catch (error) {
    console.warn("Confirmation dialog not available in this browser context.", error);
    return true;
  }
}

function safePrompt(message, fallbackValue = "") {
  try {
    if (typeof globalThis.prompt === "function") {
      return globalThis.prompt(message, fallbackValue);
    }
  } catch (error) {
    console.warn("Prompt dialog not available in this browser context.", error);
    return null;
  }

  return null;
}

function renderEmailLetterhead({
  toName,
  toCompany,
  toEmail,
  subject,
  body,
  fromName = "Barney R. Gilliom",
  fromTitle = "Independent Freelancer, Gilliom Frontline Digital"
}) {
  const safeBody = String(body || "").trim();
  const sections = safeBody
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${escapeHtml(part).replaceAll("\n", "<br />")}</p>`)
    .join("");

  return `
    <article class="letterhead-paper">
      <div class="letterhead-top">
        <div class="letterhead-brand">Gilliom Frontline Digital</div>
        <div class="letterhead-meta">Client Outreach Email</div>
      </div>
      <div class="letterhead-rule"></div>
      <div class="letterhead-address">
        <div><strong>To:</strong> ${escapeHtml(toName || "Prospective Contact")}</div>
        <div><strong>Company:</strong> ${escapeHtml(toCompany || "Not provided")}</div>
        <div><strong>Email:</strong> ${escapeHtml(toEmail || "Not provided")}</div>
        <div><strong>Date:</strong> ${new Date().toLocaleDateString()}</div>
      </div>
      <div class="letterhead-subject"><strong>Subject:</strong> ${escapeHtml(subject || "Business Follow-up")}</div>
      <div class="letterhead-body">${sections || "<p>No email body content available.</p>"}</div>
      <div class="letterhead-signature">
        <div>Sincerely,</div>
        <div class="name">${escapeHtml(fromName)}</div>
        <div>${escapeHtml(fromTitle)}</div>
      </div>
    </article>
  `;
}

function renderCampaignPreview(result, mode = "send") {
  const generatedEmails = Array.isArray(result?.generatedEmails) ? result.generatedEmails : [];
  const first = generatedEmails[0];

  if (!first) {
    return `<div class="letterhead-empty">No generated emails to preview.</div>`;
  }

  const summary =
    mode === "deliver"
      ? `Delivery attempted for ${generatedEmails.length} generated email(s).`
      : `Generated ${generatedEmails.length} personalized email(s). Showing first draft.`;

  return `
    <div class="letterhead-summary">${escapeHtml(summary)}</div>
    ${renderEmailLetterhead({
      toName: first.company || "Prospective Contact",
      toCompany: first.company,
      toEmail: first.email,
      subject: first.subject,
      body: first.body
    })}
  `;
}

function activateNav() {
  const page = document.body.dataset.page;
  const links = document.querySelectorAll(".nav-list a");

  links.forEach((link) => {
    if (link.dataset.page === page) {
      link.classList.add("active");
    }
  });
}

async function hydrateHeader() {
  const companyLabel = byId("companyLabel");
  if (!companyLabel) {
    return;
  }

  const config = await api.getConfig();
  companyLabel.textContent = config.companyName;
}

async function initDashboard() {
  const analytics = await api.getAnalytics({ recentLimit: 10 });

  byId("metricProspects").textContent = analytics.prospects;
  byId("metricEmails").textContent = analytics.emailsSent;
  byId("metricMeetings").textContent = analytics.meetings;
  byId("metricPipeline").textContent = formatCurrency(analytics.pipelineValue);

  const activityEl = byId("recentActivity");
  const limitSelect = byId("activityLimit");
  const trimKeepLastInput = byId("trimKeepLast");
  const refreshBtn = byId("refreshActivityBtn");
  const trimBtn = byId("trimActivityBtn");
  const selectAllBtn = byId("activitySelectAllBtn");
  const clearSelectionBtn = byId("activityClearSelectionBtn");
  const deleteSelectedBtn = byId("activityDeleteSelectedBtn");

  async function loadActivity() {
    const limit = Number(limitSelect?.value || 25);
    const rows = await api.getActivity({ limit });

    activityEl.innerHTML = rows
      .map((item) => {
        return `<tr>
          <td><input type="checkbox" data-row-id="${item.id}" aria-label="Select activity row" /></td>
          <td>${new Date(item.createdAt).toLocaleString()}</td>
          <td>${escapeHtml(item.type || "-")}</td>
          <td>${escapeHtml(item.message || "")}</td>
          <td>
            <div class="flex">
              <button class="small secondary" data-action="edit" data-id="${item.id}">Edit</button>
              <button class="small secondary" data-action="delete" data-id="${item.id}">Delete</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  await loadActivity();

  if (limitSelect) {
    limitSelect.addEventListener("change", loadActivity);
  }

  if (refreshBtn) {
    refreshBtn.addEventListener("click", loadActivity);
  }

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => setAllRowsSelected("recentActivity", true));
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => setAllRowsSelected("recentActivity", false));
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      const ids = getSelectedRowIds("recentActivity");

      if (ids.length === 0) {
        setNotice("dashboardNotice", "Select at least one activity row first.", "error");
        return;
      }

      const confirmed = safeConfirm(`Delete ${ids.length} selected activity log(s)?`);
      if (!confirmed) return;

      try {
        const result = await api.bulkDeleteActivity(ids);
        setNotice("dashboardNotice", `Deleted ${result.removed} activity log(s).`);
        await loadActivity();
      } catch (error) {
        setNotice("dashboardNotice", error.message, "error");
      }
    });
  }

  if (trimBtn) {
    trimBtn.addEventListener("click", async () => {
      const keepLast = Number(trimKeepLastInput?.value || 200);

      if (!Number.isFinite(keepLast) || keepLast < 10) {
        setNotice("dashboardNotice", "Enter a valid number (10 or greater).", "error");
        return;
      }

      try {
        const result = await api.pruneActivity(keepLast);
        setNotice(
          "dashboardNotice",
          `Logs trimmed. Removed ${result.removed} record(s), kept ${result.currentCount}.`
        );
        await loadActivity();
      } catch (error) {
        setNotice("dashboardNotice", error.message, "error");
      }
    });
  }

  activityEl.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;
    if (!id) return;

    try {
      if (action === "delete") {
        const confirmed = safeConfirm("Delete this log entry?");
        if (!confirmed) return;
        await api.deleteActivity(id);
        setNotice("dashboardNotice", "Log entry deleted.");
        await loadActivity();
        return;
      }

      if (action === "edit") {
        const currentType = button.closest("tr")?.children?.[1]?.textContent || "activity.updated";
        const currentMessage = button.closest("tr")?.children?.[2]?.textContent || "";
        const nextType = safePrompt("Edit log type:", currentType);
        if (nextType === null) return;
        const nextMessage = safePrompt("Edit log message:", currentMessage);
        if (nextMessage === null) return;

        await api.updateActivity(id, {
          type: nextType.trim() || "activity.updated",
          message: nextMessage.trim()
        });

        setNotice("dashboardNotice", "Log entry updated.");
        await loadActivity();
      }
    } catch (error) {
      setNotice("dashboardNotice", error.message, "error");
    }
  });
}

function tierTagClass(tier) {
  const lower = String(tier || "cold").toLowerCase();
  if (lower === "hot") return "hot";
  if (lower === "warm") return "warm";
  return "cold";
}

async function refreshProspects() {
  const state = globalThis.__prospectQueryState || {
    page: 1,
    pageSize: 50,
    search: "",
    industry: "",
    country: "",
    tier: "",
    stage: "",
    product: "",
    minScore: "",
    sortBy: "score",
    sortDir: "desc"
  };

  globalThis.__prospectQueryState = state;

  const result = await api.queryProspects(state);
  const prospects = result.items || [];
  globalThis.__prospectPageItems = prospects;
  const body = byId("prospectTableBody");

  const meta = byId("prospectResultMeta");
  if (meta) {
    const total = result.total || prospects.length;
    const page = result.page || 1;
    const totalPages = result.totalPages || 1;
    meta.textContent = `Showing ${prospects.length} records (page ${page}/${totalPages}, total ${total})`;
  }

  body.innerHTML = prospects
    .map((prospect) => {
      return `<tr>
        <td><input type="checkbox" data-row-id="${prospect.id}" aria-label="Select prospect row" /></td>
        <td>${prospect.company}</td>
        <td>${prospect.firstName || ""} ${prospect.lastName || ""}<br><small>${prospect.title || ""}</small></td>
        <td>${prospect.email}</td>
        <td>${prospect.industry || "-"}</td>
        <td>${prospect.recommendedProduct || "-"}</td>
        <td><span class="tag ${tierTagClass(prospect.tier)}">${prospect.tier} (${prospect.score})</span></td>
        <td class="flex">
          <button class="small primary" data-action="select" data-id="${prospect.id}">Select</button>
          <button class="small secondary" data-action="advance" data-id="${prospect.id}">Advance</button>
          <button class="small secondary" data-action="delete" data-id="${prospect.id}">Delete</button>
        </td>
      </tr>`;
    })
    .join("");

  if (globalThis.__prospectAllResultsSelected) {
    setAllRowsSelected("prospectTableBody", true);
  }
}

function nextStage(stage) {
  const stages = ["lead", "contacted", "qualified", "proposal", "negotiation", "won"];
  const index = stages.indexOf(stage || "lead");
  return stages[Math.min(index + 1, stages.length - 1)];
}

async function initProspects() {
  const form = byId("prospectForm");
  const filterForm = byId("prospectFilterForm");
  const aiDraftForm = byId("aiDraftForm");
  const selectedProspectLabel = byId("selectedProspectLabel");
  const selectAllBtn = byId("prospectSelectAllBtn");
  const selectAllResultsBtn = byId("prospectSelectAllResultsBtn");
  const clearSelectionBtn = byId("prospectClearSelectionBtn");
  const deleteSelectedBtn = byId("prospectDeleteSelectedBtn");

  if (globalThis.__prospectAllResultsSelected === undefined) {
    globalThis.__prospectAllResultsSelected = false;
  }

  function setSelectedProspect(prospect) {
    globalThis.__selectedProspect = prospect;

    if (!selectedProspectLabel) {
      return;
    }

    if (!prospect) {
      selectedProspectLabel.textContent = "No prospect selected. Click Select on a row below.";
      return;
    }

    const contact = [prospect.firstName, prospect.lastName].filter(Boolean).join(" ");
    selectedProspectLabel.textContent = `Selected: ${prospect.company} (${contact || "No contact"} - ${prospect.email || "No email"})`;
  }

  function syncFilterStateFromForm() {
    if (!filterForm) return;
    const state = globalThis.__prospectQueryState;
    const data = Object.fromEntries(new FormData(filterForm).entries());

    state.search = data.search || "";
    state.industry = data.industry || "";
    state.country = data.country || "";
    state.tier = data.tier || "";
    state.stage = data.stage || "";
    state.product = data.product || "";
    state.minScore = data.minScore || "";
    state.sortBy = data.sortBy || "score";
    state.sortDir = data.sortDir || "desc";
    state.page = 1;
  }

  await refreshProspects();
  setSelectedProspect(globalThis.__selectedProspect || null);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const data = Object.fromEntries(new FormData(form).entries());
      data.engagementLevel = Number(data.engagementLevel || 0);
      await api.createProspect(data);
      form.reset();
      setNotice("prospectNotice", "Prospect created and auto-scored.");
      globalThis.__prospectQueryState.page = 1;
      await refreshProspects();
    } catch (error) {
      setNotice("prospectNotice", error.message, "error");
    }
  });

  if (filterForm) {
    filterForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      syncFilterStateFromForm();
      await refreshProspects();
    });
  }

  const resetFiltersBtn = byId("prospectResetFilters");
  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", async () => {
      if (filterForm) {
        filterForm.reset();
      }

      globalThis.__prospectQueryState = {
        page: 1,
        pageSize: 50,
        search: "",
        industry: "",
        country: "",
        tier: "",
        stage: "",
        product: "",
        minScore: "",
        sortBy: "score",
        sortDir: "desc"
      };

      await refreshProspects();
    });
  }

  const prevBtn = byId("prospectPrevPage");
  if (prevBtn) {
    prevBtn.addEventListener("click", async () => {
      const state = globalThis.__prospectQueryState;
      if (state.page > 1) {
        state.page -= 1;
        await refreshProspects();
      }
    });
  }

  const nextBtn = byId("prospectNextPage");
  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      const state = globalThis.__prospectQueryState;
      state.page += 1;
      await refreshProspects();
    });
  }

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      globalThis.__prospectAllResultsSelected = false;
      setAllRowsSelected("prospectTableBody", true);
      setNotice("prospectNotice", "Current page rows selected.");
    });
  }

  if (selectAllResultsBtn) {
    selectAllResultsBtn.addEventListener("click", () => {
      globalThis.__prospectAllResultsSelected = true;
      setAllRowsSelected("prospectTableBody", true);
      setNotice("prospectNotice", "All filtered results selected across pages.");
    });
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => {
      globalThis.__prospectAllResultsSelected = false;
      setAllRowsSelected("prospectTableBody", false);
      setNotice("prospectNotice", "Selection cleared.");
    });
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      const state = globalThis.__prospectQueryState || {};
      const query = {
        search: state.search || "",
        industry: state.industry || "",
        country: state.country || "",
        tier: state.tier || "",
        stage: state.stage || "",
        product: state.product || "",
        minScore: state.minScore || "",
        sortBy: state.sortBy || "score",
        sortDir: state.sortDir || "desc"
      };

      if (globalThis.__prospectAllResultsSelected) {
        const confirmed = safeConfirm("Delete all filtered prospects across all pages?");
        if (!confirmed) return;

        try {
          const result = await api.bulkDeleteProspectsByQuery(query);
          setNotice(
            "prospectNotice",
            `Deleted ${result.removed} prospect(s) from ${result.matched} filtered record(s).`
          );
          globalThis.__prospectAllResultsSelected = false;
          globalThis.__prospectQueryState.page = 1;
          setSelectedProspect(null);
          await refreshProspects();
        } catch (error) {
          setNotice("prospectNotice", error.message, "error");
        }

        return;
      }

      const ids = getSelectedRowIds("prospectTableBody");

      if (ids.length === 0) {
        setNotice("prospectNotice", "Select at least one prospect first.", "error");
        return;
      }

      const confirmed = safeConfirm(`Delete ${ids.length} selected prospect(s)?`);
      if (!confirmed) return;

      try {
        const result = await api.bulkDeleteProspects(ids);
        setNotice("prospectNotice", `Deleted ${result.removed} prospect(s).`);
        globalThis.__prospectQueryState.page = 1;

        if (
          globalThis.__selectedProspect &&
          ids.includes(globalThis.__selectedProspect.id)
        ) {
          setSelectedProspect(null);
        }

        await refreshProspects();
      } catch (error) {
        setNotice("prospectNotice", error.message, "error");
      }
    });
  }

  byId("prospectTableBody").addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-row-id]");
    if (!checkbox) {
      return;
    }

    if (!checkbox.checked) {
      globalThis.__prospectAllResultsSelected = false;
    }
  });

  const exportBtn = byId("prospectExportCsv");
  if (exportBtn) {
    exportBtn.addEventListener("click", () => {
      const state = globalThis.__prospectQueryState || {};
      const exportParams = {
        search: state.search || "",
        industry: state.industry || "",
        country: state.country || "",
        tier: state.tier || "",
        stage: state.stage || "",
        product: state.product || "",
        minScore: state.minScore || "",
        sortBy: state.sortBy || "score",
        sortDir: state.sortDir || "desc"
      };

      globalThis.open(api.getProspectExportUrl(exportParams), "_blank", "noopener,noreferrer");
    });
  }

  if (aiDraftForm) {
    aiDraftForm.addEventListener("submit", async (event) => {
      event.preventDefault();

      const selectedProspect = globalThis.__selectedProspect;
      if (!selectedProspect) {
        setNotice("prospectNotice", "Select a prospect first.", "error");
        return;
      }

      try {
        const data = Object.fromEntries(new FormData(aiDraftForm).entries());
        const result = await api.generateAiEmailDraft({
          prospectId: selectedProspect.id,
          jobTitle: data.jobTitle,
          resumeSummary: data.resumeSummary,
          tone: data.tone
        });

        byId("aiDraftOutput").textContent = JSON.stringify(result, null, 2);
        setNotice("prospectNotice", `AI draft generated for ${selectedProspect.company}.`);
      } catch (error) {
        setNotice("prospectNotice", error.message, "error");
      }
    });
  }

  byId("prospectTableBody").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    const id = button.dataset.id;

    try {
      if (button.dataset.action === "select") {
        const item = (globalThis.__prospectPageItems || []).find((prospect) => prospect.id === id);
        setSelectedProspect(item || null);
        setNotice("prospectNotice", item ? `Selected ${item.company}.` : "Prospect selection cleared.");
      }

      if (button.dataset.action === "delete") {
        await api.deleteProspect(id);
        setNotice("prospectNotice", "Prospect deleted.");
        globalThis.__prospectQueryState.page = 1;

        if (globalThis.__selectedProspect && globalThis.__selectedProspect.id === id) {
          setSelectedProspect(null);
        }
      }

      if (button.dataset.action === "advance") {
        const prospects = await api.getProspects();
        const item = prospects.find((prospect) => prospect.id === id);
        if (item) {
          await api.updateProspect(id, { stage: nextStage(item.stage) });
          setNotice("prospectNotice", "Prospect advanced in CRM pipeline.");
        }
      }

      await refreshProspects();
    } catch (error) {
      setNotice("prospectNotice", error.message, "error");
    }
  });
}

async function refreshCampaigns() {
  const campaigns = await api.getCampaigns();
  const body = byId("campaignTableBody");

  body.innerHTML = campaigns
    .map((campaign) => {
      return `<tr>
        <td><input type="checkbox" data-row-id="${campaign.id}" aria-label="Select campaign row" /></td>
        <td>${campaign.name}</td>
        <td>${campaign.product}</td>
        <td>${campaign.targetIndustry || "Any"}</td>
        <td><span class="tag active">${campaign.status}</span></td>
        <td>${campaign.emailsSent || 0}</td>
        <td>${campaign.replies || 0}</td>
        <td>${campaign.meetingsBooked || 0}</td>
        <td class="flex">
          <button class="small primary" data-action="send" data-id="${campaign.id}">Generate</button>
          <button class="small secondary" data-action="deliver" data-id="${campaign.id}">Send Now</button>
          <button class="small secondary" data-action="sequence" data-id="${campaign.id}">Launch Sequence</button>
          <button class="small secondary" data-action="delete" data-id="${campaign.id}">Delete</button>
        </td>
      </tr>`;
    })
    .join("");

  if (globalThis.__campaignAllResultsSelected) {
    setAllRowsSelected("campaignTableBody", true);
  }
}

async function initCampaigns() {
  const form = byId("campaignForm");
  const selectAllBtn = byId("campaignSelectAllBtn");
  const selectAllResultsBtn = byId("campaignSelectAllResultsBtn");
  const clearSelectionBtn = byId("campaignClearSelectionBtn");
  const deleteSelectedBtn = byId("campaignDeleteSelectedBtn");

  if (globalThis.__campaignAllResultsSelected === undefined) {
    globalThis.__campaignAllResultsSelected = false;
  }
  await refreshCampaigns();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await api.createCampaign(data);
      form.reset();
      setNotice("campaignNotice", "Campaign created.");
      await refreshCampaigns();
    } catch (error) {
      setNotice("campaignNotice", error.message, "error");
    }
  });

  byId("campaignTableBody").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    try {
      if (button.dataset.action === "send") {
        const result = await api.sendCampaign(button.dataset.id, { deliverNow: false });
        byId("campaignOutput").innerHTML = renderCampaignPreview(result, "send");
        setNotice(
          "campaignNotice",
          `Campaign generated ${result.generatedEmails.length} personalized emails.`
        );
      }

      if (button.dataset.action === "deliver") {
        const result = await api.sendCampaign(button.dataset.id, { deliverNow: true });
        byId("campaignOutput").innerHTML = renderCampaignPreview(result, "deliver");
        setNotice(
          "campaignNotice",
          `Campaign delivery attempted for ${result.generatedEmails.length} contacts.`
        );
      }

      if (button.dataset.action === "sequence") {
        const result = await api.launchCampaignSequence(button.dataset.id);
        byId("campaignOutput").innerHTML = `
          <div class="letterhead-summary">Sequence queued successfully.</div>
          <article class="letterhead-paper">
            <div class="letterhead-top">
              <div class="letterhead-brand">Campaign Sequence Launch Report</div>
              <div class="letterhead-meta">Operational Summary</div>
            </div>
            <div class="letterhead-rule"></div>
            <div class="letterhead-body">
              <p><strong>Campaign ID:</strong> ${escapeHtml(result.campaignId)}</p>
              <p><strong>Jobs Created:</strong> ${escapeHtml(result.jobsCreated)}</p>
              <p><strong>Prospects Targeted:</strong> ${escapeHtml(result.prospectsTargeted)}</p>
            </div>
          </article>
        `;
        setNotice("campaignNotice", `Sequence launched. Jobs created: ${result.jobsCreated}.`);
      }

      if (button.dataset.action === "delete") {
        const confirmed = safeConfirm("Delete this campaign?");
        if (!confirmed) return;

        await api.deleteCampaign(button.dataset.id);
        setNotice("campaignNotice", "Campaign deleted.");
      }

      await refreshCampaigns();
    } catch (error) {
      setNotice("campaignNotice", error.message, "error");
    }
  });

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      globalThis.__campaignAllResultsSelected = false;
      setAllRowsSelected("campaignTableBody", true);
      setNotice("campaignNotice", "Current page campaigns selected.");
    });
  }

  if (selectAllResultsBtn) {
    selectAllResultsBtn.addEventListener("click", () => {
      globalThis.__campaignAllResultsSelected = true;
      setAllRowsSelected("campaignTableBody", true);
      setNotice("campaignNotice", "All campaign results selected.");
    });
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => {
      globalThis.__campaignAllResultsSelected = false;
      setAllRowsSelected("campaignTableBody", false);
      setNotice("campaignNotice", "Selection cleared.");
    });
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      if (globalThis.__campaignAllResultsSelected) {
        const confirmed = safeConfirm("Delete all campaign results?");
        if (!confirmed) return;

        try {
          const result = await api.bulkDeleteCampaignsByQuery({});
          setNotice("campaignNotice", `Deleted ${result.removed} campaign(s) from ${result.matched} result(s).`);
          globalThis.__campaignAllResultsSelected = false;
          await refreshCampaigns();
        } catch (error) {
          setNotice("campaignNotice", error.message, "error");
        }

        return;
      }

      const ids = getSelectedRowIds("campaignTableBody");

      if (ids.length === 0) {
        setNotice("campaignNotice", "Select at least one campaign first.", "error");
        return;
      }

      const confirmed = safeConfirm(`Delete ${ids.length} selected campaign(s)?`);
      if (!confirmed) return;

      try {
        const result = await api.bulkDeleteCampaigns(ids);
        setNotice("campaignNotice", `Deleted ${result.removed} campaign(s).`);
        await refreshCampaigns();
      } catch (error) {
        setNotice("campaignNotice", error.message, "error");
      }
    });
  }

  byId("campaignTableBody").addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-row-id]");
    if (!checkbox) return;

    if (!checkbox.checked) {
      globalThis.__campaignAllResultsSelected = false;
    }
  });
}

async function refreshInquiries() {
  const inquiries = await api.getInquiries();
  const body = byId("inquiryTableBody");

  body.innerHTML = inquiries
    .map((inquiry) => {
      return `<tr>
        <td><input type="checkbox" data-row-id="${inquiry.id}" aria-label="Select inquiry row" /></td>
        <td>${inquiry.name}<br><small>${inquiry.company || ""}</small></td>
        <td>${inquiry.email}</td>
        <td>${inquiry.message}</td>
        <td><span class="tag ${inquiry.status}">${inquiry.status}</span></td>
        <td class="flex">
          <button class="small primary" data-action="reply" data-id="${inquiry.id}">Auto Reply</button>
          <button class="small secondary" data-action="delete" data-id="${inquiry.id}">Delete</button>
        </td>
      </tr>`;
    })
    .join("");

  if (globalThis.__inquiryAllResultsSelected) {
    setAllRowsSelected("inquiryTableBody", true);
  }
}

async function initInbox() {
  const form = byId("inquiryForm");
  const selectAllBtn = byId("inquirySelectAllBtn");
  const selectAllResultsBtn = byId("inquirySelectAllResultsBtn");
  const clearSelectionBtn = byId("inquiryClearSelectionBtn");
  const deleteSelectedBtn = byId("inquiryDeleteSelectedBtn");

  if (globalThis.__inquiryAllResultsSelected === undefined) {
    globalThis.__inquiryAllResultsSelected = false;
  }
  await refreshInquiries();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await api.createInquiry(data);
      form.reset();
      setNotice("inquiryNotice", "Inquiry captured in shared inbox.");
      await refreshInquiries();
    } catch (error) {
      setNotice("inquiryNotice", error.message, "error");
    }
  });

  byId("inquiryTableBody").addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;

    try {
      if (button.dataset.action === "reply") {
        const result = await api.replyInquiry(button.dataset.id);
        byId("replyOutput").innerHTML = renderEmailLetterhead({
          toName: result?.inquiry?.name,
          toCompany: result?.inquiry?.company,
          toEmail: result?.inquiry?.email,
          subject: "Follow-up on Your Inquiry",
          body: result.reply
        });
        setNotice("inquiryNotice", "AI-generated follow-up drafted and attached to inquiry.");
      }

      if (button.dataset.action === "delete") {
        const confirmed = safeConfirm("Delete this inquiry?");
        if (!confirmed) return;

        await api.deleteInquiry(button.dataset.id);
        setNotice("inquiryNotice", "Inquiry deleted.");
      }

      await refreshInquiries();
    } catch (error) {
      setNotice("inquiryNotice", error.message, "error");
    }
  });

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => {
      globalThis.__inquiryAllResultsSelected = false;
      setAllRowsSelected("inquiryTableBody", true);
      setNotice("inquiryNotice", "Current page inquiries selected.");
    });
  }

  if (selectAllResultsBtn) {
    selectAllResultsBtn.addEventListener("click", () => {
      globalThis.__inquiryAllResultsSelected = true;
      setAllRowsSelected("inquiryTableBody", true);
      setNotice("inquiryNotice", "All inquiry results selected.");
    });
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => {
      globalThis.__inquiryAllResultsSelected = false;
      setAllRowsSelected("inquiryTableBody", false);
      setNotice("inquiryNotice", "Selection cleared.");
    });
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      if (globalThis.__inquiryAllResultsSelected) {
        const confirmed = safeConfirm("Delete all inquiry results?");
        if (!confirmed) return;

        try {
          const result = await api.bulkDeleteInquiriesByQuery({});
          setNotice("inquiryNotice", `Deleted ${result.removed} inquiry record(s) from ${result.matched} result(s).`);
          globalThis.__inquiryAllResultsSelected = false;
          await refreshInquiries();
        } catch (error) {
          setNotice("inquiryNotice", error.message, "error");
        }

        return;
      }

      const ids = getSelectedRowIds("inquiryTableBody");

      if (ids.length === 0) {
        setNotice("inquiryNotice", "Select at least one inquiry first.", "error");
        return;
      }

      const confirmed = safeConfirm(`Delete ${ids.length} selected inquiry record(s)?`);
      if (!confirmed) return;

      try {
        const result = await api.bulkDeleteInquiries(ids);
        setNotice("inquiryNotice", `Deleted ${result.removed} inquiry record(s).`);
        await refreshInquiries();
      } catch (error) {
        setNotice("inquiryNotice", error.message, "error");
      }
    });
  }

  byId("inquiryTableBody").addEventListener("change", (event) => {
    const checkbox = event.target.closest("input[data-row-id]");
    if (!checkbox) return;

    if (!checkbox.checked) {
      globalThis.__inquiryAllResultsSelected = false;
    }
  });
}

async function refreshProposals() {
  const proposals = await api.getProposals();
  const body = byId("proposalTableBody");

  body.innerHTML = proposals
    .map((proposal) => {
      return `<tr>
        <td><input type="checkbox" data-row-id="${proposal.id}" aria-label="Select proposal row" /></td>
        <td>${proposal.company}</td>
        <td>${proposal.productName}</td>
        <td>${formatCurrency(proposal.total)} / month</td>
        <td><span class="tag draft">${proposal.status}</span></td>
        <td>
          <div class="flex">
            <a href="${proposal.stripeCheckoutLink}" target="_blank" rel="noreferrer">Start Subscription</a>
            <button class="small secondary" data-action="delete" data-id="${proposal.id}">Delete</button>
          </div>
        </td>
      </tr>`;
    })
    .join("");
}

async function initProposals() {
  const products = await api.getProducts();
  const select = byId("proposalProductId");
  const form = byId("proposalForm");
  const selectAllBtn = byId("proposalSelectAllBtn");
  const clearSelectionBtn = byId("proposalClearSelectionBtn");
  const deleteSelectedBtn = byId("proposalDeleteSelectedBtn");

  select.innerHTML = products
    .map((product) => `<option value="${product.id}">${product.name} (${formatCurrency(product.priceFrom)}+)</option>`)
    .join("");

  const deploymentStripeProduct = products.find((item) =>
    String(item.name || "").toLowerCase() === "deployment & stripe automation center"
  );

  const prefillBtn = byId("prefillDeploymentStripeBtn");
  if (prefillBtn) {
    prefillBtn.addEventListener("click", () => {
      if (!deploymentStripeProduct) {
        setNotice("proposalNotice", "Deployment & Stripe Automation Center plan is not available.", "error");
        return;
      }

      select.value = deploymentStripeProduct.id;

      const priceField = form.querySelector("[name='price']");
      if (priceField && !priceField.value) {
        priceField.value = String(deploymentStripeProduct.priceFrom || 0);
      }

      const scopeField = form.querySelector("[name='scope']");
      if (scopeField && !scopeField.value) {
        scopeField.value = [
          "1. Monthly client usage access and account provisioning",
          "2. Stripe subscription billing, invoices, and payment recovery",
          "3. Ongoing support SLA and operational monitoring",
          "4. Monthly optimization reviews and feature iteration"
        ].join("\n");
      }

      setNotice("proposalNotice", "Deployment & Stripe monthly plan prefill applied.");
    });
  }

  await refreshProposals();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.target).entries());
      data.price = Number(data.price || 0);
      await api.createProposal(data);
      event.target.reset();
      setNotice("proposalNotice", "Monthly subscription plan generated with Stripe checkout link.");
      await refreshProposals();
    } catch (error) {
      setNotice("proposalNotice", error.message, "error");
    }
  });

  byId("proposalTableBody").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    try {
      if (button.dataset.action === "delete") {
        const confirmed = safeConfirm("Delete this proposal?");
        if (!confirmed) return;

        await api.deleteProposal(button.dataset.id);
        setNotice("proposalNotice", "Subscription plan deleted.");
        await refreshProposals();
      }
    } catch (error) {
      setNotice("proposalNotice", error.message, "error");
    }
  });

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => setAllRowsSelected("proposalTableBody", true));
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => setAllRowsSelected("proposalTableBody", false));
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      const ids = getSelectedRowIds("proposalTableBody");

      if (ids.length === 0) {
        setNotice("proposalNotice", "Select at least one proposal first.", "error");
        return;
      }

      const confirmed = safeConfirm(`Delete ${ids.length} selected proposal(s)?`);
      if (!confirmed) return;

      try {
        const result = await api.bulkDeleteProposals(ids);
        setNotice("proposalNotice", `Deleted ${result.removed} subscription plan(s).`);
        await refreshProposals();
      } catch (error) {
        setNotice("proposalNotice", error.message, "error");
      }
    });
  }
}

async function initScheduling() {
  const listBody = byId("demoTableBody");
  const selectAllBtn = byId("demoSelectAllBtn");
  const clearSelectionBtn = byId("demoClearSelectionBtn");
  const deleteSelectedBtn = byId("demoDeleteSelectedBtn");

  async function refreshDemos() {
    const demos = await api.getDemos();
    listBody.innerHTML = demos
      .map((demo) => {
        return `<tr>
          <td><input type="checkbox" data-row-id="${demo.id}" aria-label="Select demo row" /></td>
          <td>${demo.company}</td>
          <td>${demo.contact}</td>
          <td>${new Date(demo.dateTime).toLocaleString()}</td>
          <td>${demo.channel || "-"}</td>
          <td>
            <div class="flex">
              <span class="tag scheduled">${demo.status}</span>
              <button class="small secondary" data-action="delete" data-id="${demo.id}">Delete</button>
            </div>
          </td>
        </tr>`;
      })
      .join("");
  }

  await refreshDemos();

  byId("demoForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const data = Object.fromEntries(new FormData(event.target).entries());
      await api.createDemo(data);
      event.target.reset();
      setNotice("demoNotice", "Demo scheduled and tracked in pipeline.");
      await refreshDemos();
    } catch (error) {
      setNotice("demoNotice", error.message, "error");
    }
  });

  listBody.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    try {
      if (button.dataset.action === "delete") {
        const confirmed = safeConfirm("Delete this demo schedule?");
        if (!confirmed) return;

        await api.deleteDemo(button.dataset.id);
        setNotice("demoNotice", "Demo deleted.");
        await refreshDemos();
      }
    } catch (error) {
      setNotice("demoNotice", error.message, "error");
    }
  });

  if (selectAllBtn) {
    selectAllBtn.addEventListener("click", () => setAllRowsSelected("demoTableBody", true));
  }

  if (clearSelectionBtn) {
    clearSelectionBtn.addEventListener("click", () => setAllRowsSelected("demoTableBody", false));
  }

  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener("click", async () => {
      const ids = getSelectedRowIds("demoTableBody");

      if (ids.length === 0) {
        setNotice("demoNotice", "Select at least one demo first.", "error");
        return;
      }

      const confirmed = safeConfirm(`Delete ${ids.length} selected demo(s)?`);
      if (!confirmed) return;

      try {
        const result = await api.bulkDeleteDemos(ids);
        setNotice("demoNotice", `Deleted ${result.removed} demo(s).`);
        await refreshDemos();
      } catch (error) {
        setNotice("demoNotice", error.message, "error");
      }
    });
  }
}

async function initAnalytics() {
  const data = await api.getAnalytics();

  byId("analyticsGrid").innerHTML = `
    <div class="card"><div class="metric-label">Reply Rate</div><div class="metric-value">${data.replyRate}%</div></div>
    <div class="card"><div class="metric-label">Meeting Rate</div><div class="metric-value">${data.meetingRate}%</div></div>
    <div class="card"><div class="metric-label">Open Inquiries</div><div class="metric-value">${data.openInquiries}</div></div>
    <div class="card"><div class="metric-label">Hot Leads</div><div class="metric-value">${data.hotLeads}</div></div>
    <div class="card"><div class="metric-label">Warm Leads</div><div class="metric-value">${data.warmLeads}</div></div>
    <div class="card"><div class="metric-label">Demos Scheduled</div><div class="metric-value">${data.demosScheduled}</div></div>
  `;

  byId("activityBody").innerHTML = data.recentActivity
    .map((item) => `<tr><td>${new Date(item.createdAt).toLocaleString()}</td><td>${item.type}</td><td>${item.message}</td></tr>`)
    .join("");
}

async function initAutomationStudio() {
  async function loadIntegrationStatus() {
    const result = await api.getIntegrationStatus();
    byId("integrationOutput").textContent = JSON.stringify(result, null, 2);
  }

  async function loadAiAutomationStatus() {
    const status = await api.getAiAutomationStatus();
    byId("aiAutomationOutput").textContent = JSON.stringify(status, null, 2);

    const form = byId("aiAutomationSettingsForm");
    if (form && status.config) {
      form.elements.enabled.value = String(Boolean(status.config.enabled));
      form.elements.dailyLimit.value = String(status.config.dailyLimit || 25);
      form.elements.jobTitle.value = status.config.jobTitle || "CTO";
      form.elements.tone.value = status.config.tone || "consultative";
      form.elements.resumeSummary.value = status.config.resumeSummary || "";
    }
  }

  async function loadPipelineRecommendations() {
    const result = await api.getPipelineRecommendations(12);
    byId("pipelineRecommendationsOutput").textContent = JSON.stringify(result, null, 2);
  }

  byId("bulkProspectForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const formData = Object.fromEntries(new FormData(event.target).entries());
      formData.count = Number(formData.count || 5000);
      const result = await api.bulkGenerateProspects(formData);
      byId("bulkProspectOutput").textContent = JSON.stringify(result, null, 2);
      setNotice("studioNotice", `Prospect database generated: ${result.created} records added.`);
    } catch (error) {
      setNotice("studioNotice", error.message, "error");
    }
  });

  byId("discoveryForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const formData = Object.fromEntries(new FormData(event.target).entries());
      formData.count = Number(formData.count || 50);
      const result = await api.discoverCompanies(formData);
      byId("discoveryOutput").textContent = JSON.stringify(result, null, 2);
      setNotice("studioNotice", `Discovery complete: ${result.generated} companies identified.`);
    } catch (error) {
      setNotice("studioNotice", error.message, "error");
    }
  });

  byId("techDetectForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const formData = Object.fromEntries(new FormData(event.target).entries());
      const result = await api.detectWebsiteTech(formData);
      byId("techOutput").textContent = JSON.stringify(result, null, 2);
      setNotice("studioNotice", "Technology detection completed.");
    } catch (error) {
      setNotice("studioNotice", error.message, "error");
    }
  });

  byId("sequenceForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const formData = Object.fromEntries(new FormData(event.target).entries());
      const result = await api.getEmailSequence(formData.product, formData.role);
      byId("sequenceOutput").textContent = JSON.stringify(result, null, 2);
      setNotice("studioNotice", "4-step sequence generated.");
    } catch (error) {
      setNotice("studioNotice", error.message, "error");
    }
  });

  byId("loadAssetsBtn").addEventListener("click", async () => {
    try {
      const result = await api.getSalesAssets();
      byId("assetOutput").textContent = JSON.stringify(result, null, 2);
      setNotice("studioNotice", "Sales asset package loaded.");
    } catch (error) {
      setNotice("studioNotice", error.message, "error");
    }
  });

  byId("calendarForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const formData = Object.fromEntries(new FormData(event.target).entries());
      const result = await api.getMarketingCalendar(formData.year);
      byId("calendarOutput").textContent = JSON.stringify(result, null, 2);
      setNotice("studioNotice", "12-month calendar generated.");
    } catch (error) {
      setNotice("studioNotice", error.message, "error");
    }
  });

  byId("loadIntegrationStatusBtn").addEventListener("click", async () => {
    try {
      await loadIntegrationStatus();
      setNotice("studioNotice", "Integration status refreshed.");
    } catch (error) {
      setNotice("studioNotice", error.message, "error");
    }
  });

  byId("processEmailJobsBtn").addEventListener("click", async () => {
    try {
      const result = await api.processEmailJobs({ limit: 500 });
      byId("integrationOutput").textContent = JSON.stringify(result, null, 2);
      setNotice("studioNotice", `Email job processing complete. Sent: ${result.sent}, Failed: ${result.failed}.`);
    } catch (error) {
      setNotice("studioNotice", error.message, "error");
    }
  });

  const aiSettingsForm = byId("aiAutomationSettingsForm");
  if (aiSettingsForm) {
    aiSettingsForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const formData = Object.fromEntries(new FormData(event.target).entries());
        const enabledValue = typeof formData.enabled === "string" ? formData.enabled : "true";
        await api.saveAiAutomationSettings({
          enabled: enabledValue === "true",
          dailyLimit: Number(formData.dailyLimit || 25),
          jobTitle: formData.jobTitle,
          tone: formData.tone,
          resumeSummary: formData.resumeSummary
        });
        await loadAiAutomationStatus();
        setNotice("studioNotice", "AI automation settings saved.");
      } catch (error) {
        setNotice("studioNotice", error.message, "error");
      }
    });
  }

  const runAiBtn = byId("runAiAutomationBtn");
  if (runAiBtn) {
    runAiBtn.addEventListener("click", async () => {
      try {
        const result = await api.runAiAutomation({});
        byId("aiAutomationOutput").textContent = JSON.stringify(result, null, 2);
        await loadIntegrationStatus();
        await loadPipelineRecommendations();
        setNotice(
          "studioNotice",
          `AI automation completed. Outreach queued: ${result.outreachQueued || 0}, follow-ups queued: ${result.followUpsQueued || 0}.`
        );
      } catch (error) {
        setNotice("studioNotice", error.message, "error");
      }
    });
  }

  const refreshAiBtn = byId("refreshAiAutomationBtn");
  if (refreshAiBtn) {
    refreshAiBtn.addEventListener("click", async () => {
      try {
        await loadAiAutomationStatus();
        setNotice("studioNotice", "AI automation status refreshed.");
      } catch (error) {
        setNotice("studioNotice", error.message, "error");
      }
    });
  }

  const loadRecommendationsBtn = byId("loadPipelineRecommendationsBtn");
  if (loadRecommendationsBtn) {
    loadRecommendationsBtn.addEventListener("click", async () => {
      try {
        await loadPipelineRecommendations();
        setNotice("studioNotice", "Pipeline next-best-action recommendations loaded.");
      } catch (error) {
        setNotice("studioNotice", error.message, "error");
      }
    });
  }

  await loadIntegrationStatus();
  if (byId("aiAutomationOutput")) {
    await loadAiAutomationStatus();
  }
  if (byId("pipelineRecommendationsOutput")) {
    await loadPipelineRecommendations();
  }
}

async function initSettings() {
  const output = byId("settingsOutput");

  async function refresh() {
    const status = await api.getSettingsEnv();
    output.textContent = JSON.stringify(status, null, 2);
  }

  byId("refreshSettingsStatus").addEventListener("click", async () => {
    try {
      await refresh();
      setNotice("settingsNotice", "Runtime status refreshed.");
    } catch (error) {
      setNotice("settingsNotice", error.message, "error");
    }
  });

  byId("clearSettingsOutput").addEventListener("click", () => {
    output.textContent = "";
    setNotice("settingsNotice", "Output cleared.");
  });

  await refresh();
}

async function boot() {
  activateNav();
  await hydrateHeader();

  const page = document.body.dataset.page;

  if (page === "dashboard") await initDashboard();
  if (page === "prospects") await initProspects();
  if (page === "campaigns") await initCampaigns();
  if (page === "inbox") await initInbox();
  if (page === "proposals") await initProposals();
  if (page === "scheduling") await initScheduling();
  if (page === "analytics") await initAnalytics();
  if (page === "automation") await initAutomationStudio();
  if (page === "settings") await initSettings();
}

boot().catch((error) => {
  const fallback = byId("globalError");
  if (fallback) {
    fallback.innerHTML = `<div class="alert error">${error.message}</div>`;
  }
});
