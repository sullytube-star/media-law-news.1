// Hand-picked stories shown on the homepage alongside the live RSS items.
// They are archived like feed stories so they get permanent article pages too.
// Keep in sync with `curatedNews` in index.html (used there as an offline fallback).
export type CuratedStory = {
  title: string
  date: string
  category: string
  summary: string
  source: string
  link: string
  tags: string[]
}

export const CURATED_STORIES: CuratedStory[] = [
  {
    "title": "SCOTUS Upholds Texas Age-Verification Law for Adult Websites",
    "date": "2025-06-27",
    "category": "first-amendment",
    "summary": "In Free Speech Coalition v. Paxton, the Court upheld Texas’s requirement that users verify age before accessing pornographic content. Major implications for online adult speech and age-based content restrictions.",
    "source": "Supreme Court / FIRE",
    "link": "https://www.supremecourt.gov/opinions/24pdf/23-1122_new.pdf",
    "tags": [
      "SCOTUS",
      "Adult Content",
      "Age Verification"
    ]
  },
  {
    "title": "Supreme Court Rules ISPs Not Contributorily Liable for User Piracy in Cox v. Sony",
    "date": "2026-03-25",
    "category": "entertainment",
    "summary": "In a unanimous decision, the Court held that Cox Communications was not contributorily liable for copyright infringement simply because it knew some subscribers were pirating music.",
    "source": "SCOTUSblog / Law360",
    "link": "https://www.scotusblog.com/cases/cox-communications-inc-v-sony-music-entertainment/",
    "tags": [
      "Copyright",
      "ISP Liability",
      "Section 512"
    ]
  },
  {
    "title": "Colorado Conversion Therapy Ban Struck as Viewpoint Discrimination",
    "date": "2026-03-31",
    "category": "first-amendment",
    "summary": "A 2026 decision striking down a state ban on conversion therapy emphasized major constitutional problems with viewpoint-based restrictions on speech and counseling.",
    "source": "SCOTUS / First Amendment Encyclopedia",
    "link": "https://www.supremecourt.gov/opinions/25pdf/24-539_fd9g.pdf",
    "tags": [
      "Professional Speech",
      "Viewpoint Discrimination",
      "LGBTQ+"
    ]
  },
  {
    "title": "TikTok Ban Law Survives First Amendment Challenge",
    "date": "2025-01-17",
    "category": "media-law",
    "summary": "TikTok v. Garland: Supreme Court rejected claims that the law forcing divestiture or ban of TikTok violated the platform’s and users’ free speech rights.",
    "source": "Knight First Amendment Institute",
    "link": "https://knightcolumbia.org/",
    "tags": [
      "Social Media",
      "National Security",
      "Platform Speech"
    ]
  },
  {
    "title": "Eleventh Circuit Tosses Roy Moore’s $8.2M Defamation Award Against Laura Loomer",
    "date": "2026-04-12",
    "category": "media-law",
    "summary": "Court reverses massive defamation verdict, reinforcing strong protections for political speech and commentary even when sharp or controversial.",
    "source": "Media Law Resource Center",
    "link": "https://medialaw.org/",
    "tags": [
      "Defamation",
      "Political Speech",
      "Actual Malice"
    ]
  },
  {
    "title": "Major Music Labels Win Key Copyright Victory — But SCOTUS Narrows Secondary Liability",
    "date": "2026-03-26",
    "category": "entertainment",
    "summary": "While Sony and other labels secured significant damages at trial, the Supreme Court narrowed how far copyright owners can reach upstream to impose liability.",
    "source": "Law360 Media",
    "link": "https://www.law360.com/media",
    "tags": [
      "Music Copyright",
      "Secondary Liability",
      "DMCA"
    ]
  },
  {
    "title": "NYT v. OpenAI Copyright Case Moves Forward on Training Data Claims",
    "date": "2026-02-18",
    "category": "media-law",
    "summary": "Ongoing high-stakes litigation tests whether using copyrighted news articles to train large language models constitutes fair use or infringement.",
    "source": "Various / Legal Tech Hub",
    "link": "https://www.law.com/",
    "tags": [
      "AI",
      "Copyright",
      "Fair Use",
      "News Media"
    ]
  },
  {
    "title": "First Amendment Watch Launches National SLAPP Database",
    "date": "2026-01-15",
    "category": "first-amendment",
    "summary": "New public database tracks Strategic Lawsuits Against Public Participation targeting journalists, activists, and critics across the country.",
    "source": "First Amendment Watch",
    "link": "https://firstamendmentwatch.org/",
    "tags": [
      "SLAPP",
      "Anti-SLAPP",
      "Press Freedom"
    ]
  }
]
