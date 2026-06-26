"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";

type Job = {
  id: string;
  job_title: string;
  company_name: string;
  location: string;
  job_url: string;
  experience_min: number;
  experience_max: number;
};

export default function SavedJobs() {
  const { data: session, status } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pipeline" | "portals">(
    "pipeline",
  );

  // Manual input form state for tracking applications
  const [manualTitle, setManualTitle] = useState("");
  const [manualCompany, setManualCompany] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualLocation, setManualLocation] = useState("");

  // Form state for adding custom portals to the grid
  const [newPortalName, setNewPortalName] = useState("");
  const [newPortalUrl, setNewPortalUrl] = useState("");

  // Pre-loaded list of 50 target companies
  const defaultCompanies = [
    // Tech / FAANG
    {
      name: "Atlassian",
      url: "https://www.atlassian.com/company/careers/all-jobs?location=India",
    },
    {
      name: "Google",
      url: "https://www.google.com/about/careers/applications/jobs/results/?location=India",
    },
    {
      name: "Microsoft",
      url: "https://jobs.careers.microsoft.com/global/en/search?lc=India",
    },
    { name: "Amazon", url: "https://www.amazon.jobs/en/locations/india" },
    { name: "Apple", url: "https://jobs.apple.com/en-in/search" },
    {
      name: "Meta",
      url: "https://www.metacareers.com/jobs/?offices[0]=Bengaluru%2C%20India",
    },
    {
      name: "Netflix",
      url: "https://jobs.netflix.com/search?location=Mumbai%2C%20India",
    },

    // Enterprise SaaS & Cloud
    {
      name: "Salesforce",
      url: "https://careers.salesforce.com/en/jobs/?search=&country=India",
    },
    {
      name: "Adobe",
      url: "https://careers.adobe.com/us/en/search-results?keywords=India",
    },
    {
      name: "ServiceNow",
      url: "https://careers.servicenow.com/jobs?location=India",
    },
    { name: "Workday", url: "https://workday.wd5.myworkdayjobs.com/Workday" },
    { name: "Intuit", url: "https://jobs.intuit.com/search-jobs?k=&l=India" },
    {
      name: "Snowflake",
      url: "https://careers.snowflake.com/us/en/search-results",
    },
    { name: "Databricks", url: "https://careers.databricks.com/" },
    { name: "VMware / Broadcom", url: "https://careers.broadcom.com/" },
    { name: "Oracle", url: "https://careers.oracle.com/jobs/" },
    { name: "SAP", url: "https://jobs.sap.com/" },
    {
      name: "Cisco",
      url: "https://jobs.cisco.com/jobs/SearchJobs/?3_109_3=%5B1662%5D",
    },

    // Cybersecurity (GRC/IAM Targets)
    {
      name: "Palo Alto Networks",
      url: "https://jobs.paloaltonetworks.com/en/",
    },
    {
      name: "CrowdStrike",
      url: "https://crowdstrike.wd5.myworkdayjobs.com/crowdstrikecareers",
    },
    { name: "Fortinet", url: "https://careers.fortinet.com/" },
    { name: "Zscaler", url: "https://www.zscaler.com/careers/search-jobs" },
    { name: "Okta", url: "https://www.okta.com/company/careers/" },
    { name: "Splunk", url: "https://www.splunk.com/en_us/careers.html" },
    { name: "Cloudflare", url: "https://www.cloudflare.com/careers/jobs/" },
    { name: "Tanium", url: "https://careers.tanium.com/" },

    // Hardware / Semiconductors
    {
      name: "Nvidia",
      url: "https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite",
    },
    { name: "Intel", url: "https://jobs.intel.com/en/search-jobs" },
    { name: "AMD", url: "https://careers.amd.com/careers-home/jobs" },
    { name: "Qualcomm", url: "https://careers.qualcomm.com/careers" },
    { name: "ARM", url: "https://careers.arm.com/" },

    // FinTech & Payments
    { name: "Visa", url: "https://search.jobs.visa.com/" },
    {
      name: "Mastercard",
      url: "https://mastercard.wd1.myworkdayjobs.com/CorporateCareers",
    },
    { name: "PayPal", url: "https://careers.paypal.com/" },
    { name: "Stripe", url: "https://stripe.com/jobs/search" },
    { name: "Block (Square)", url: "https://block.xyz/careers" },

    // Big 4 & Finance GCCs
    {
      name: "Deloitte",
      url: "https://southasiacareers.deloitte.com/go/Deloitte-India/718244/",
    },
    {
      name: "PwC",
      url: "https://pwc.wd3.myworkdayjobs.com/Global_Experienced_Careers",
    },
    { name: "EY", url: "https://careers.ey.com/ey/job" },
    { name: "KPMG", url: "https://kpmg.com/xx/en/home/careers.html" },
    { name: "Goldman Sachs", url: "https://www.goldmansachs.com/careers/" },
    {
      name: "JPMorgan Chase",
      url: "https://careers.jpmorgan.com/global/en/home",
    },
    {
      name: "Morgan Stanley",
      url: "https://www.morganstanley.com/people/experienced-professionals",
    },

    // Consumer Tech & Others
    { name: "Uber", url: "https://www.uber.com/us/en/careers/" },
    { name: "Airbnb", url: "https://careers.airbnb.com/" },
    { name: "Spotify", url: "https://www.lifeatspotify.com/jobs" },
    {
      name: "Walmart Global Tech",
      url: "https://careers.walmart.com/technology/india",
    },
    {
      name: "Target",
      url: "https://corporate.target.com/careers/target-in-india",
    },
    { name: "LinkedIn", url: "https://careers.linkedin.com/" },
  ];

  // Dynamic state for Custom Portals
  const [dreamCompanies, setDreamCompanies] =
    useState<{ name: string; url: string }[]>(defaultCompanies);

  // Load custom portals from LocalStorage on mount
  useEffect(() => {
    const savedPortals = localStorage.getItem("custom_dream_portals");
    if (savedPortals) {
      setDreamCompanies([...defaultCompanies, ...JSON.parse(savedPortals)]);
    }
  }, []);

  const fetchSaved = async () => {
    if (!session?.user?.email) return;
    try {
      const res = await fetch("http://localhost:8080/api/jobs/saved", {
        headers: { "X-User-Email": session.user.email },
      });
      const data = await res.json();
      setJobs(data || []);
    } catch (error) {
      console.error("Failed to fetch saved jobs:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      fetchSaved();
    }
  }, [session, status]);

  const handleUnsave = async (jobId: string) => {
    if (!session?.user?.email) return;
    try {
      const res = await fetch("http://localhost:8080/api/jobs/unsave", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Email": session.user.email,
        },
        body: JSON.stringify({ job_id: jobId }),
      });
      if (res.ok) {
        setJobs(jobs.filter((j) => j.id !== jobId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Real API intercept for custom manual entry tracking
  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle || !manualCompany || !session?.user?.email) return;

    try {
      const res = await fetch("http://localhost:8080/api/jobs/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Email": session.user.email,
        },
        body: JSON.stringify({
          title: manualTitle,
          company: manualCompany,
          location: manualLocation || "Remote",
          url: manualUrl,
        }),
      });

      if (res.ok) {
        const { id } = await res.json();

        const newJob: Job = {
          id: id,
          job_title: manualTitle,
          company_name: manualCompany,
          location: manualLocation || "Remote",
          job_url: manualUrl || "#",
          experience_min: -1,
          experience_max: -1,
        };

        setJobs([newJob, ...jobs]);
        setManualTitle("");
        setManualCompany("");
        setManualUrl("");
        setManualLocation("");
      }
    } catch (err) {
      console.error("Failed to log manual job:", err);
    }
  };

  // Handler to add a custom portal to the grid (saves to LocalStorage)
  const handleAddPortal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPortalName || !newPortalUrl) return;

    const updatedCustom = JSON.parse(
      localStorage.getItem("custom_dream_portals") || "[]",
    );
    const newItem = { name: newPortalName, url: newPortalUrl };

    const newFullList = [...updatedCustom, newItem];
    localStorage.setItem("custom_dream_portals", JSON.stringify(newFullList));

    setDreamCompanies([...defaultCompanies, ...newFullList]);
    setNewPortalName("");
    setNewPortalUrl("");
  };

  if (status === "loading")
    return (
      <div className="p-8 text-center text-gray-500">Loading profile...</div>
    );
  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 flex flex-col items-center justify-center">
        <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">
          You must be signed in to view saved jobs.
        </h1>
        <Link href="/" className="text-blue-600 hover:underline">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8 transition-colors">
      <div className="max-w-6xl mx-auto">
        {/* Navigation header & Tab Switcher */}
        <div className="mb-6">
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-blue-600 mb-2 inline-block"
          >
            ← Back to Feed
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Your Tracking Vault
          </h1>

          <div className="flex border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setActiveTab("pipeline")}
              className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors ${
                activeTab === "pipeline"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Applications Pipeline ({jobs.length})
            </button>
            <button
              onClick={() => setActiveTab("portals")}
              className={`py-2 px-4 font-medium text-sm border-b-2 transition-colors ${
                activeTab === "portals"
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              Target Portals ({dreamCompanies.length})
            </button>
          </div>
        </div>

        {/* Tab 1: Pipeline Interface */}
        {activeTab === "pipeline" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-fadeIn">
            <div className="lg:col-span-2 grid gap-4">
              {loading ? (
                <p className="text-gray-500">Loading pipeline...</p>
              ) : jobs.length === 0 ? (
                <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <p className="text-gray-500 dark:text-gray-400">
                    Pipeline is currently empty.
                  </p>
                </div>
              ) : (
                jobs.map((job) => (
                  <div
                    key={job.id}
                    className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm border border-l-4 border-l-blue-500 border-gray-200 dark:border-gray-700"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                          {job.job_title}
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          {job.company_name}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          📍 {job.location}
                        </p>
                      </div>
                      <button
                        onClick={() => handleUnsave(job.id)}
                        className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 bg-red-50 dark:bg-red-900/20 rounded"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="mt-3 text-right">
                      <a
                        href={job.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block bg-blue-600 text-white text-xs px-3 py-1.5 rounded hover:bg-blue-700 font-medium"
                      >
                        Apply ↗
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Sidebar purely for Logging External Applications */}
            <div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm sticky top-6">
                <h3 className="font-bold text-gray-900 dark:text-white mb-3 text-sm">
                  Log External Application
                </h3>
                <form onSubmit={handleAddManual} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Role Title *
                    </label>
                    <input
                      required
                      type="text"
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                      placeholder="e.g., Cyber Security Analyst"
                      className="w-full text-sm p-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Company *
                    </label>
                    <input
                      required
                      type="text"
                      value={manualCompany}
                      onChange={(e) => setManualCompany(e.target.value)}
                      placeholder="e.g., Atlassian"
                      className="w-full text-sm p-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Location
                    </label>
                    <input
                      type="text"
                      value={manualLocation}
                      onChange={(e) => setManualLocation(e.target.value)}
                      placeholder="e.g., Bengaluru"
                      className="w-full text-sm p-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white rounded"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Job Link URL
                    </label>
                    <input
                      type="url"
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full text-sm p-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white rounded"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2 rounded transition-colors shadow-sm mt-2"
                  >
                    Add to Pipeline
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Dedicated Grid View for Career Portals */}
        {activeTab === "portals" && (
          <div className="space-y-6 animate-fadeIn">
            {/* Quick Add Custom Portal Form */}
            <form
              onSubmit={handleAddPortal}
              className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-3 items-end shadow-sm"
            >
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Target Company Name
                </label>
                <input
                  required
                  type="text"
                  value={newPortalName}
                  onChange={(e) => setNewPortalName(e.target.value)}
                  placeholder="e.g., Airbnb"
                  className="w-full text-sm p-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white rounded"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Career Portal URL
                </label>
                <input
                  required
                  type="url"
                  value={newPortalUrl}
                  onChange={(e) => setNewPortalUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full text-sm p-2 border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white rounded"
                />
              </div>
              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2 px-4 rounded transition-colors shadow-sm h-[38px]"
              >
                + Add Custom Portal
              </button>
            </form>

            {/* Grid of 50+ Portals */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {dreamCompanies.map((c, index) => (
                <div
                  key={`${c.name}-${index}`}
                  className="bg-white dark:bg-gray-800 p-5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col justify-between hover:border-blue-400 dark:hover:border-blue-500 transition-all"
                >
                  <div>
                    <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">
                      {c.name}
                    </h3>
                    <p
                      className="text-xs text-gray-400 dark:text-gray-500 mb-4 truncate w-full"
                      title={c.url}
                    >
                      {new URL(c.url).hostname}
                    </p>
                  </div>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full text-center bg-gray-50 hover:bg-blue-600 dark:bg-gray-700 text-gray-700 dark:text-gray-200 dark:hover:bg-blue-600 hover:text-white transition-colors text-sm font-medium py-2 rounded border border-gray-200 dark:border-gray-600 hover:border-transparent"
                  >
                    Open Portal ↗
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
