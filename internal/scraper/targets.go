// internal/scraper/targets.go
package scraper

import (
	"log"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Target defines the configuration for a specific company's Workday tenant
type Target struct {
	Company string
	Domain  string
	Tenant  string
	Board   string
}

// RunFortune500Scrape kicks off the scrape for all configured Workday targets.
func RunFortune500Scrape(pool *pgxpool.Pool) {
	targets := GetWorkdayTargets()
	log.Printf("Starting Workday scrape. %d companies targeted.", len(targets))
	ScrapeMultipleWorkday(pool, targets)
}

// GetWorkdayTargets returns the list of verified Workday job boards.
func GetWorkdayTargets() []Target {
	return []Target{
		// Big 4 & Consulting

		{"PwC", "pwc.wd3.myworkdayjobs.com", "pwc", "Global_Experienced_Careers"},
		{"Visa", "visa.wd5.myworkdayjobs.com", "visa", "Visa"},
		{"Cloudera", "cloudera.wd5.myworkdayjobs.com", "cloudera", "External_Career"},
		{"CrowdStrike", "crowdstrike.wd5.myworkdayjobs.com", "crowdstrike", "crowdstrikecareers"},
		{"Logitech", "logitech.wd5.myworkdayjobs.com", "logitech", "Logitech"},

		// Global Product MNCs & FAANG-adjacent

		{"Cisco", "cisco.wd5.myworkdayjobs.com", "cisco", "Cisco_Careers"},
		{"Salesforce", "salesforce.wd1.myworkdayjobs.com", "salesforce", "External"},
		{"Nvidia", "nvidia.wd5.myworkdayjobs.com", "nvidia", "NVIDIAExternalCareerSite"},
		{"Adobe", "adobe.wd5.myworkdayjobs.com", "adobe", "external_experience"},

		{"Atlassian", "atlassian.wd5.myworkdayjobs.com", "atlassian", "Careers"},

		// Finance / FinTech GCCs
		{"Mastercard", "mastercard.wd1.myworkdayjobs.com", "mastercard", "CorporateCareers"},
		{"Visa", "visa.wd1.myworkdayjobs.com", "visa", "Visa_Careers"},
		{"Goldman Sachs", "gs.wd1.myworkdayjobs.com", "gs", "GSCareers"},
		{"Capital One", "capitalone.wd1.myworkdayjobs.com", "capitalone", "Capital_One"},
		{"PayPal", "paypal.wd1.myworkdayjobs.com", "paypal", "jobs"},

		// Cybersecurity Giants
		{"Palo Alto Networks", "paloaltonetworks.wd1.myworkdayjobs.com", "paloaltonetworks", "Careers"},
		{"CrowdStrike", "crowdstrike.wd5.myworkdayjobs.com", "crowdstrike", "crowdstrikecareers"},
	}
}
