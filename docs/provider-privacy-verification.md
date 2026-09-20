# Provider privacy verification

**Reviewed:** 20 September 2026  
**Scope:** public provider terms and product documentation used for the App
Store privacy review. This is not proof that an optional DPA, enterprise
feature, retention add-on, regional endpoint, or zero-retention control has
been purchased, accepted, or enabled for SHÜÜT.

## Release decision

The public terms support the privacy-label choices in
[`privacy-label-inputs.md`](privacy-label-inputs.md): SHÜÜT collects data for
app functionality and safety, links it to an account where described, and does
not use it for tracking. Until an applicable ElevenLabs business agreement and
account-level training opt-out are evidenced, voice audio and transcript data
must also be marked for **Other Purposes** because the supplied terms permit
provider model improvement. The evidence does **not** support a promise of
immediate provider-side deletion, EU-only processing, or zero retention.

Before submission, the release owner must retain account-level evidence for
the controls actually in force: the accepted provider terms/DPA, Postmark
retention setting and Data Removal API status, ElevenLabs plan and data-use
setting, and the Replit deployment and AI Integration configuration. Public
terms alone cannot prove those account settings.

Account checks performed on 20 September 2026 established that the production
environment has credentials configured for Postmark, ElevenLabs, and
Replit-managed OpenAI access. Postmark accepted the configured server token,
but its server metadata did not expose retention configuration and its removal
API has no non-destructive settings/status endpoint. ElevenLabs returned 401
for account/subscription metadata with the configured credential, so its plan,
data-use setting, and credential health remain unverified. Replit confirmed an
active, public autoscale deployment with a successful build, but the deployment
metadata available to the agent did not expose publishing geography.

## Account evidence reviewed

The following user-supplied evidence was reviewed on 20 September 2026:

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| `0_Shuut_Postmark_Server_Settings_20Sep26_1789911420356.png` | An active SHÜÜT Postmark server exists. Open and link tracking are disabled at server level. | The retention add-on value, Data Removal API enablement, suppression-list handling, or DPA execution status. |
| `0_Postmark_Terms_Effective_May_3,_2022_1789911446714.pdf` | The supplied existing-customer Terms bind use of Postmark and incorporate Postmark’s Privacy Policy and DPA by reference. | A non-default account retention setting or provider-side deletion completion for a particular recipient. |
| `0_Replit_Data_Processing_Agreement_1_April_2026_1789912206698.pdf` | The current Replit DPA provides processor terms, disclosed-subprocessor obligations, SCC Modules 2/3 and the UK transfer instrument, and return/deletion on request up to 90 days after agreement termination subject to legal retention. | That this DPA binds the SHÜÜT account: its first page says it forms part of a Replit Commercial Agreement, which was not supplied. It also gives no per-object deletion SLA or backup purge interval. |
| `1_Replit_Subprocessors_August_2026_1789912206703.pdf` | The August 2026 list identifies Google (cloud infrastructure and AI), OpenAI (AI models), and OpenRouter (AI model selection for Integrations) as US subprocessors, among others. | Which upstream AI route handled a particular SHÜÜT request or which optional retention/region controls applied. |
| `2_Replit_Terms_of_Service_3_August_2026_1789912206705.pdf` | Replit’s general Terms place app-user privacy notices, consent, correction, and erasure obligations on the publisher and say account deletion follows Replit’s retention policy and applicable law. | A numeric application-data retention period, publishing geography, or applicability of the Commercial Agreement/DPA. |
| `0_ElevenLabs_Terms_of_Service_(non-EEA)_31_March_2026_1789912468479.pdf` | The supplied terms permit ElevenLabs to use content to improve services and develop products, with a prospective account opt-out under Data use settings. Entity use incorporates a DPA. | Governing terms for a UK operator: the document expressly excludes the EEA, Switzerland, and UK. It does not prove SHÜÜT’s plan, opt-out state, or applicable DPA. |
| `1_ElevenLabs_Privacy_Policy_20_May2026_1789912468483.pdf` | For controller processing, ElevenLabs describes US storage, US/Netherlands/Singapore hosting/server locations, model-training use, prospective training opt-out, general purpose-based retention, and voice-generated data retention no longer than three years after last interaction except where law requires otherwise. | Business-customer processor terms: the policy expressly says those are governed by the customer’s DPA. It does not establish a per-request erasure SLA or SHÜÜT’s settings. |

**Submission status:** the evidence supports **No tracking** because SHÜÜT has
no advertising/tracking flow and Postmark open/link tracking is disabled. It
does not support functionality-only processing for ElevenLabs, a named Replit
publishing region, ZDR, immediate provider erasure, or a numeric provider backup
purge period. App Store and legal sign-off must use those conservative limits.

## Verified provider matrix

| Provider and data | Public retention / deletion terms | Identifier or deletion support | Subprocessors and locations | Transfer safeguards | SHÜÜT conclusion |
| --- | --- | --- | --- | --- | --- |
| **Postmark / AC PM LLC** — recipient email, message content, delivery metadata | Default message content and activity retention is 45 days. The optional retention add-on permits 7–365 days. Expired data is queued for deletion; Postmark says custom retention below 45 days is removed within 24 hours and longer custom retention may take up to 7 days. Aggregated statistics are indefinite. The general EU privacy page separately says bounces, spam complaints, and unsubscribed recipients are stored indefinitely in suppression lists. On termination, the DPA provides return or destruction on written request, except backups/archives under the retention schedule and legal retention. | Postmark documents an account/recipient Data Removal API with request status, but it is disabled by default and must be enabled by support. Its privacy page says data-subject requests receive a response within 14 days; that is a response target, not a guaranteed erasure SLA. | The DPA authorizes listed subprocessors. The current list is maintained by Postmark and can change under the DPA notice/objection process. Public materials describe US processing infrastructure; do not claim EU-only email processing. | The supplied Terms incorporate the DPA by reference. The current DPA lists EU-US DPF, UK Extension, Swiss-US DPF, EU SCCs, UK Addendum, and Brazil SCCs as applicable. | Open/link tracking is evidenced as disabled. Disclose email processing. Do not promise immediate erasure of suppression, aggregate, backup, archive, or legally retained data. The account retention and Data Removal API configuration remain unproven. |
| **ElevenLabs** — submitted voice audio and generated transcript | The public DPA says enterprise customer content is deleted within 30 days after agreement expiry/termination unless the customer agrees otherwise. For self-serve services, ElevenLabs reserves the right, but has no obligation, to delete customer content after 180 days of inactivity. Backups are purged under standard retention policies, for which no numeric public period is stated. The supplied controller privacy policy uses purpose-based retention and caps generated voice data at three years after last interaction, subject to legal exceptions, but expressly defers business-customer processing to the applicable DPA. | Public documentation provides account/personal-data deletion request channels, but the speech-to-text response used by SHÜÜT exposes no per-request provider deletion identifier. No public per-request erasure SLA was found. | The live list is maintained at ElevenLabs’ compliance portal. The DPA requires substantially protective subprocessor terms and at least 30 days’ notice for additions or replacements. The privacy policy identifies hosting/server locations in the US, Netherlands, and Singapore and says personal data is transferred to the US for storage. Data residency is discretionary and does not prevent access or processing elsewhere by subprocessors, support, or moderation teams. | DPA permits adequacy decisions/DPF, SCCs, and other lawful safeguards; the privacy policy identifies EU-US and Swiss-US DPF, the UK Extension, and contractual safeguards including SCCs. | Treat voice audio as internationally processed and potentially used for provider model improvement. The supplied non-EEA Terms do not govern a UK operator; do not claim the account opted out, EU-only storage, a numeric backup purge period, immediate erasure, or enterprise termination deletion. |
| **OpenAI reached through Replit AI Integrations** — transcript text and moderation output | OpenAI’s API documentation says API data is not used to train models by default unless the customer opts in. Default abuse-monitoring logs may include prompts/responses and are retained up to 30 days, subject to legal/safety exceptions. Some endpoints keep application state; Zero Data Retention and Modified Abuse Monitoring require approval and have endpoint limitations. | OpenAI documents organization/project controls, not a per-moderation-request deletion ID in SHÜÜT. SHÜÜT does not hold the upstream OpenAI account because access is through Replit-managed AI Integrations. | OpenAI publishes a subprocessor list. Replit is also in the processing chain as the managed integration provider. Replit’s public AI Integration page does not identify the upstream account settings selected for SHÜÜT requests. | OpenAI offers a DPA and regional controls to eligible direct customers. Regional storage/processing applies only to supported projects/endpoints and excludes some system data. Replit’s public materials do not prove that these optional OpenAI controls pass through to this managed integration. | Disclose Replit-managed OpenAI processing. Use “up to 30 days under default OpenAI API controls” only as an upstream public default, not as a guaranteed SHÜÜT contractual ceiling. Do not claim ZDR, a selected OpenAI region, or direct OpenAI DPA coverage without Replit/account evidence. |
| **Replit App Storage and hosting** — stored content, account/profile data, logs, and application operations | Replit’s public App Storage and deployment documentation describes the service and security controls but does not publish an object-deletion SLA, backup purge interval, or general application-log retention period applicable to this project. Its DPA addresses return/deletion at agreement termination, subject to its terms, but does not create an immediate per-object deletion SLA. Application deletion removes SHÜÜT’s live references and queues object deletion; provider backups and operational records remain subject to Replit’s applicable terms and schedules. | SHÜÜT can address live App Storage objects by object path. Public documentation does not establish a provider-issued deletion receipt or completion SLA for an object or backup. | Replit publishes a live subprocessor page and states published applications run on Google Cloud Platform. Multiple publishing geographies are available and compute, database, and Object Storage are colocated in the selected geography. The deployment API confirmed a live public autoscale deployment but did not expose SHÜÜT’s selected geography. | Replit’s current DPA incorporates EU SCCs and the UK Addendum and generally authorizes disclosed subprocessors. The exact mechanism applicable to SHÜÜT depends on the agreement in force and cannot be proven from repository code or general product documentation. | State that Replit and its subprocessors may process data internationally. Do not name SHÜÜT’s hosting geography, backup purge period, or provider deletion SLA without account-level evidence. |

## Sources reviewed

Official sources current at the review date:

- Postmark: [DPA](https://postmarkapp.com/dpa),
  [EU privacy and subprocessor information](https://postmarkapp.com/eu-privacy),
  and [retention add-on documentation](https://postmarkapp.com/support/article/how-does-the-retention-add-on-work).
- ElevenLabs: [DPA](https://elevenlabs.io/dpa),
  [privacy policy](https://elevenlabs.io/privacy), and
  [compliance/subprocessor portal](https://compliance.elevenlabs.io/).
- OpenAI: [API data controls](https://developers.openai.com/api/docs/guides/your-data)
  and [enterprise privacy](https://openai.com/enterprise-privacy/).
- Replit: [AI Integrations](https://docs.replit.com/features/integrations/replit-ai-integrations),
  [App Storage](https://docs.replit.com/features/data-and-storage/object-storage),
  [publishing](https://docs.replit.com/learn/projects-and-artifacts/replit-deployments),
  [information security](https://docs.replit.com/teams/information-security/overview),
  [DPA](https://replit.com/dpa), and
  [subprocessors](https://replit.com/subprocessors).

## Claims that remain prohibited

- “All user data is deleted immediately” or a provider erasure completion time
  that is not supported above.
- “Voice data stays in Europe,” “EU-only processing,” “all data stays in North
  America,” or any specific SHÜÜT publishing geography without account-level
  evidence.
- “Zero data retention,” “no provider keeps a copy,” or “OpenAI deletes every
  request within 30 days” for the Replit-managed integration.
- “The DPA/SCCs apply to SHÜÜT” without evidence that the relevant agreement is
  in force.
- “ElevenLabs never uses submitted data for training” without evidence of the
  applicable customer terms and account data-use setting.