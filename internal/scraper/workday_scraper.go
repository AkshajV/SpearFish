// internal/scraper/workday_scraper.go
package scraper

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/AkshajV/SpearFish/internal/database"
	"github.com/jackc/pgx/v5/pgxpool"
)

type WorkdayPayload struct {
	AppliedFacets map[string]interface{} `json:"appliedFacets"`
	Limit         int                    `json:"limit"`
	Offset        int                    `json:"offset"`
	SearchText    string                 `json:"searchText,omitempty"`
}

type WorkdayResponse struct {
	JobPostings []struct {
		Title         string `json:"title"`
		ExternalPath  string `json:"externalPath"`
		LocationsText string `json:"locationsText"`
		PostedOn      string `json:"postedOn"`
	} `json:"jobPostings"`
	Total int `json:"total"`
}

// Struct for the deep scrape
type WorkdayJobDetails struct {
	JobPostingInfo struct {
		JobDescriptionText string `json:"jobDescription"` // Maps to the real key now
	} `json:"jobPostingInfo"`
}

func ScrapeMultipleWorkday(pool *pgxpool.Pool, targets []Target) {
	for i, target := range targets {
		ScrapeWorkdayTarget(pool, target)
		if i < len(targets)-1 {
			log.Printf("Waiting 4s before next company...")
			time.Sleep(4 * time.Second)
		}
	}
	log.Println("All targets scraped.")
}

func ScrapeWorkdayTarget(pool *pgxpool.Pool, target Target) {
	url := fmt.Sprintf("https://%s/wday/cxs/%s/%s/jobs", target.Domain, target.Tenant, target.Board)
	log.Printf("[%s] Starting scrape → %s\n", target.Company, url)

	offset := 0
	limit := 20
	client := &http.Client{Timeout: 10 * time.Second}

	for {
		payload := WorkdayPayload{
			AppliedFacets: make(map[string]interface{}),
			Limit:         limit,
			Offset:        offset,
			SearchText:    "",
		}

		jsonData, err := json.Marshal(payload)
		if err != nil {
			return
		}

		req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
		if err != nil {
			return
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
		req.Header.Set("Origin", fmt.Sprintf("https://%s", target.Domain))

		resp, err := client.Do(req)
		if err != nil {
			return
		}

		bodyBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			log.Printf("[%s] Page fetch failed at offset %d: status %d", target.Company, offset, resp.StatusCode)
			break
		}

		var apiResp WorkdayResponse
		if err := json.Unmarshal(bodyBytes, &apiResp); err != nil {
			return
		}

		if len(apiResp.JobPostings) == 0 {
			break
		}

		indiaJobsCount := 0
		for _, job := range apiResp.JobPostings {
			// Apply the India filter and our custom Tech/Cyber filter here
			if isIndiaLocation(job.LocationsText) && isEntryLevelTechRole(job.Title) {
				indiaJobsCount++

				jobURL := fmt.Sprintf("https://%s/en-US/%s%s", target.Domain, target.Board, job.ExternalPath)

				// DEEP SCRAPE: Fetch the actual description text
				fullDesc := fetchFullDescription(target.Domain, target.Tenant, target.Board, job.ExternalPath)

				// 1. Always check title first
				minExp, maxExp := ParseExperience(job.Title)

				// 2. If title is unknown, check the body carefully
				if minExp == -1 {
					minExp, maxExp = ParseExperienceFromFullBody(fullDesc)
				}

				// 3. Final safety check: if it's still unknown, default to 0-1 (or your preferred threshold)
				// or just filter out if you want to be extremely strict.
				if minExp > 2 {
					log.Printf("  ! Skipping Senior role: %s (%d years)", job.Title, minExp)
					continue
				}

				err := database.SaveJob(
					pool,
					job.Title,
					target.Company,
					job.LocationsText,
					fullDesc, // Now passing the full text into the database!
					jobURL,
					"Not Disclosed",
					"Workday",
					minExp,
					maxExp,
				)
				if err != nil {
					log.Printf("  x Failed to save: %s - %v\n", job.Title, err)
				}

				// Be polite to the servers while deep scraping
				time.Sleep(500 * time.Millisecond)
			}
		}

		log.Printf("[%s] Fetched %d / %d jobs (Saved %d targeted India roles)\n", target.Company, offset+len(apiResp.JobPostings), apiResp.Total, indiaJobsCount)

		offset += limit
		if offset >= apiResp.Total {
			break
		}
		time.Sleep(3 * time.Second)
	}
}

// fetchFullDescription makes a secondary API call to get the massive description text
func fetchFullDescription(domain, tenant, board, externalPath string) string {
	url := fmt.Sprintf("https://%s/wday/cxs/%s/%s%s", domain, tenant, board, externalPath)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return ""
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != 200 {
		log.Printf("[DEBUG ERROR] Request to %s failed", url)
		return ""
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)

	var details WorkdayJobDetails
	if err := json.Unmarshal(bodyBytes, &details); err != nil {
		return ""
	}

	return details.JobPostingInfo.JobDescriptionText
}

func isIndiaLocation(loc string) bool {
	l := strings.ToLower(loc)
	indiaKeywords := []string{"india", "bengaluru", "bangalore", "pune", "hyderabad", "mumbai", "chennai", "gurugram", "noida", "delhi"}
	for _, kw := range indiaKeywords {
		if strings.Contains(l, kw) {
			return true
		}
	}
	return false
}

func isEntryLevelTechRole(title string) bool {
	t := strings.ToLower(title)

	// 1. Negative Filter
	negatives := []string{"senior", "sr.", "sr ", "lead", "head", "manager", "director", "principal", "staff", "vp", "president"}
	for _, n := range negatives {
		if strings.Contains(t, n) {
			return false
		}
	}

	// 2. Positive Filter
	positives := []string{
		"grc", "governance", "risk", "compliance",
		"cyber", "security", "infosec", "soc", "iam", "privacy",
		"software", "engineer", "developer", "programmer", "sde",
		"analyst", "consultant", "data", "cloud", "network",
		"systems", "it ", "technology", "information technology",
	}
	for _, p := range positives {
		if strings.Contains(t, p) {
			return true
		}
	}
	return false
}
