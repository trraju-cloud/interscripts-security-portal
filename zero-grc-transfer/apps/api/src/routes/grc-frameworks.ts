/**
 * GRC Framework control tracking — FedRAMP 20x and CMMC Level 2.
 *
 * Manages the lifecycle of compliance framework controls for a tenant:
 *   GET  /frameworks                                  — list enabled frameworks with stats
 *   POST /frameworks/:key/enable                      — enable a framework and seed its controls
 *   GET  /frameworks/:key/controls                    — paginated control list (filterable)
 *   GET  /frameworks/:key/controls/:controlId         — single control detail
 *   PATCH /frameworks/:key/controls/:controlId/assessment — update assessment status + evidence
 *   GET  /frameworks/:key/dashboard                   — stats by status + family + overdue reviews
 *   GET  /frameworks/:key/export                      — full JSON export (attachment)
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { requireModule } from '../middleware/module-guard.js';
import { getDB } from './time.js';
import { record as recordAudit } from '../lib/audit-collector.js';

interface ControlSeed {
  id: string;
  family: string;
  title: string;
  description: string;
  priority: string;
  baseline: string;
}

// ─── FedRAMP 20x ──────────────────────────────────────────────────────────────────
// 60 controls across 18 NIST SP 800-53 families.

const FEDRAMP_CONTROLS_SEED: ControlSeed[] = [
  // AC — Access Control (4)
  { id: 'AC-1',  family: 'AC', title: 'Access Control Policy and Procedures',           description: 'Develop, document, and disseminate an access control policy and procedures that address purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                                              priority: 'P1', baseline: 'low'      },
  { id: 'AC-2',  family: 'AC', title: 'Account Management',                              description: 'Manage information system accounts including establishing, activating, modifying, reviewing, disabling, and removing accounts, and monitor the use of system accounts.',                                                                                            priority: 'P1', baseline: 'low'      },
  { id: 'AC-3',  family: 'AC', title: 'Access Enforcement',                              description: 'Enforce approved authorizations for logical access to information and system resources in accordance with applicable access control policies.',                                                                                                                    priority: 'P1', baseline: 'low'      },
  { id: 'AC-6',  family: 'AC', title: 'Least Privilege',                                 description: 'Employ the principle of least privilege, allowing only authorized accesses for users (and processes acting on behalf of users) that are necessary to accomplish assigned organizational tasks.',                                                                   priority: 'P1', baseline: 'moderate' },
  // AT — Awareness and Training (3)
  { id: 'AT-1',  family: 'AT', title: 'Security Awareness and Training Policy and Procedures', description: 'Develop, document, and disseminate security awareness and training policy and associated procedures that address purpose, scope, roles, responsibilities, and management commitment.',                                                                       priority: 'P2', baseline: 'low'      },
  { id: 'AT-2',  family: 'AT', title: 'Security Awareness Training',                    description: 'Provide basic security awareness training to system users as part of initial training for new users, when required by system changes, and on a defined frequency thereafter.',                                                                                     priority: 'P1', baseline: 'low'      },
  { id: 'AT-3',  family: 'AT', title: 'Role-Based Security Training',                   description: 'Provide role-based security training to personnel with assigned security roles and responsibilities before authorizing access, when required by system changes, and on a defined frequency.',                                                                       priority: 'P1', baseline: 'moderate' },
  // AU — Audit and Accountability (4)
  { id: 'AU-1',  family: 'AU', title: 'Audit and Accountability Policy and Procedures', description: 'Develop, document, and disseminate audit and accountability policy and procedures covering purpose, scope, roles, responsibilities, management commitment, and compliance.',                                                                                        priority: 'P1', baseline: 'low'      },
  { id: 'AU-2',  family: 'AU', title: 'Audit Events',                                   description: 'Identify the types of events that the system is capable of auditing in support of the audit function and coordinate the audit function with other organizations requiring audit-related information.',                                                              priority: 'P1', baseline: 'low'      },
  { id: 'AU-3',  family: 'AU', title: 'Content of Audit Records',                       description: 'Ensure that audit records contain information that establishes what events occurred, the sources of events, and the outcomes of events, including at a minimum the date and time of the event, component where the event occurred, type of event, user identity, and outcome.',  priority: 'P1', baseline: 'low'      },
  { id: 'AU-6',  family: 'AU', title: 'Audit Record Review, Analysis, and Reporting',   description: 'Review and analyze system audit records on a defined frequency for indications of inappropriate or unusual activity, investigate suspicious activity or suspected violations, and report findings to defined personnel.',                                            priority: 'P1', baseline: 'low'      },
  // CA — Security Assessment and Authorization (3)
  { id: 'CA-1',  family: 'CA', title: 'Security Assessment and Authorization Policies and Procedures', description: 'Develop, document, and disseminate security assessment and authorization policy and procedures that address purpose, scope, roles, responsibilities, management commitment, coordination among entities, and compliance.',                             priority: 'P2', baseline: 'low'      },
  { id: 'CA-2',  family: 'CA', title: 'Control Assessments',                             description: 'Assess the controls in the system and its environment of operation on a defined frequency to determine the extent to which the controls are implemented correctly and producing the desired outcome.',                                                              priority: 'P2', baseline: 'low'      },
  { id: 'CA-5',  family: 'CA', title: 'Plan of Action and Milestones',                  description: 'Develop a plan of action and milestones for the information system to document the planned remediation actions to correct weaknesses or deficiencies noted during the assessment of the security controls.',                                                        priority: 'P3', baseline: 'low'      },
  // CM — Configuration Management (4)
  { id: 'CM-1',  family: 'CM', title: 'Configuration Management Policy and Procedures', description: 'Develop, document, and disseminate configuration management policy and procedures that address purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                                       priority: 'P1', baseline: 'low'      },
  { id: 'CM-2',  family: 'CM', title: 'Baseline Configuration',                         description: 'Develop, document, and maintain under configuration control a current baseline configuration of the information system, including hardware, software, firmware, and network components.',                                                                           priority: 'P1', baseline: 'low'      },
  { id: 'CM-6',  family: 'CM', title: 'Configuration Settings',                         description: 'Establish and document configuration settings for information technology products employed within the information system that reflect the most restrictive mode consistent with operational requirements.',                                                           priority: 'P1', baseline: 'moderate' },
  { id: 'CM-7',  family: 'CM', title: 'Least Functionality',                            description: 'Configure the information system to provide only essential capabilities, prohibiting or restricting the use of functions, ports, protocols, and services not required.',                                                                                            priority: 'P1', baseline: 'moderate' },
  // CP — Contingency Planning (3)
  { id: 'CP-1',  family: 'CP', title: 'Contingency Planning Policy and Procedures',     description: 'Develop, document, and disseminate contingency planning policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                                              priority: 'P1', baseline: 'low'      },
  { id: 'CP-2',  family: 'CP', title: 'Contingency Plan',                               description: 'Develop a contingency plan for the information system that identifies essential missions and business functions and associated contingency requirements, provides recovery objectives, and establishes roles and responsibilities.',                                  priority: 'P1', baseline: 'low'      },
  { id: 'CP-9',  family: 'CP', title: 'Information System Backup',                      description: 'Conduct backups of user-level and system-level information contained in the information system according to the contingency plan, and verify the integrity of backup information to detect media failures.',                                                        priority: 'P1', baseline: 'low'      },
  // IA — Identification and Authentication (4)
  { id: 'IA-1',  family: 'IA', title: 'Identification and Authentication Policy and Procedures', description: 'Develop, document, and disseminate identification and authentication policy and procedures covering purpose, scope, roles, responsibilities, and compliance.',                                                                                            priority: 'P1', baseline: 'low'      },
  { id: 'IA-2',  family: 'IA', title: 'Identification and Authentication (Organizational Users)', description: 'Uniquely identify and authenticate organizational users and implement multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts.',                                                   priority: 'P1', baseline: 'low'      },
  { id: 'IA-5',  family: 'IA', title: 'Authenticator Management',                       description: 'Manage system authenticators including verifying the identity of the individual, group, role, or device receiving the authenticator, establishing initial authenticator content, and setting minimum and maximum lifetime restrictions.',                            priority: 'P1', baseline: 'low'      },
  { id: 'IA-8',  family: 'IA', title: 'Identification and Authentication (Non-Organizational Users)', description: 'Uniquely identify and authenticate non-organizational users or processes acting on behalf of non-organizational users that access organizational information systems.',                                                                               priority: 'P1', baseline: 'low'      },
  // IR — Incident Response (3)
  { id: 'IR-1',  family: 'IR', title: 'Incident Response Policy and Procedures',        description: 'Develop, document, and disseminate incident response policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                                                 priority: 'P1', baseline: 'low'      },
  { id: 'IR-4',  family: 'IR', title: 'Incident Handling',                              description: 'Implement an incident handling capability for security incidents that includes preparation, detection, analysis, containment, eradication, and recovery, and coordinate incident handling activities with contingency planning activities.',                         priority: 'P1', baseline: 'low'      },
  { id: 'IR-6',  family: 'IR', title: 'Incident Reporting',                             description: 'Require personnel to report suspected security incidents to the organizational incident response capability within a defined time period, and report security incident information to designated authorities.',                                                      priority: 'P1', baseline: 'low'      },
  // MA — Maintenance (3)
  { id: 'MA-1',  family: 'MA', title: 'System Maintenance Policy and Procedures',       description: 'Develop, document, and disseminate system maintenance policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                                                priority: 'P2', baseline: 'low'      },
  { id: 'MA-2',  family: 'MA', title: 'Controlled Maintenance',                         description: 'Schedule, perform, document, and review records of maintenance and repairs on information system components in accordance with manufacturer or vendor specifications and organizational requirements.',                                                              priority: 'P2', baseline: 'low'      },
  { id: 'MA-4',  family: 'MA', title: 'Nonlocal Maintenance',                           description: 'Authorize, monitor, and control nonlocal maintenance and diagnostic activities, and require strong authenticators in the establishment of nonlocal maintenance and diagnostic sessions.',                                                                           priority: 'P2', baseline: 'moderate' },
  // MP — Media Protection (3)
  { id: 'MP-1',  family: 'MP', title: 'Media Protection Policy and Procedures',         description: 'Develop, document, and disseminate media protection policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                                                  priority: 'P1', baseline: 'low'      },
  { id: 'MP-2',  family: 'MP', title: 'Media Access',                                   description: 'Restrict access to digital and non-digital media containing information to authorized individuals using defined security measures, and protect and control media during transport.',                                                                                 priority: 'P1', baseline: 'low'      },
  { id: 'MP-6',  family: 'MP', title: 'Media Sanitization',                             description: 'Sanitize information system media, both digital and non-digital, prior to disposal, release out of organizational control, or release for reuse using defined sanitization techniques and procedures.',                                                             priority: 'P1', baseline: 'low'      },
  // PE — Physical and Environmental Protection (3)
  { id: 'PE-1',  family: 'PE', title: 'Physical and Environmental Protection Policy and Procedures', description: 'Develop, document, and disseminate physical and environmental protection policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                  priority: 'P1', baseline: 'low'      },
  { id: 'PE-2',  family: 'PE', title: 'Physical Access Authorizations',                 description: 'Develop, approve, and maintain a list of individuals with authorized access to the facility where the information system resides, and issue authorization credentials.',                                                                                            priority: 'P1', baseline: 'low'      },
  { id: 'PE-6',  family: 'PE', title: 'Monitoring Physical Access',                     description: 'Monitor physical access to the facility where the information system resides to detect and respond to physical security incidents, review physical access logs on a defined frequency, and coordinate results with incident response.',                               priority: 'P1', baseline: 'low'      },
  // PL — Planning (3)
  { id: 'PL-1',  family: 'PL', title: 'Security Planning Policy and Procedures',        description: 'Develop, document, and disseminate security planning policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                                                 priority: 'P1', baseline: 'low'      },
  { id: 'PL-2',  family: 'PL', title: 'System Security Plan',                           description: 'Develop a security plan for the information system that provides an overview of the security requirements for the system and describes the security controls in place or planned for meeting those requirements.',                                                   priority: 'P1', baseline: 'low'      },
  { id: 'PL-8',  family: 'PL', title: 'Information Security Architecture',              description: 'Develop an information security architecture for the information system that describes the overall philosophy, requirements, and approach to be taken with regard to protecting the confidentiality, integrity, and availability of organizational information.',    priority: 'P2', baseline: 'moderate' },
  // PS — Personnel Security (3)
  { id: 'PS-1',  family: 'PS', title: 'Personnel Security Policy and Procedures',       description: 'Develop, document, and disseminate personnel security policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                                                priority: 'P1', baseline: 'low'      },
  { id: 'PS-3',  family: 'PS', title: 'Personnel Screening',                            description: 'Screen individuals prior to authorizing access to the information system and rescreening individuals according to defined conditions requiring rescreening and a defined frequency for such rescreening.',                                                          priority: 'P1', baseline: 'low'      },
  { id: 'PS-6',  family: 'PS', title: 'Access Agreements',                              description: 'Develop and document access agreements for organizational information systems, review and update the agreements on a defined frequency, and ensure individuals who require access sign appropriate agreements before being granted access.',                          priority: 'P3', baseline: 'low'      },
  // RA — Risk Assessment (3)
  { id: 'RA-1',  family: 'RA', title: 'Risk Assessment Policy and Procedures',          description: 'Develop, document, and disseminate risk assessment policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                                                   priority: 'P1', baseline: 'low'      },
  { id: 'RA-3',  family: 'RA', title: 'Risk Assessment',                                description: 'Conduct an assessment of risk, including the likelihood and magnitude of harm resulting from unauthorized access, use, disclosure, disruption, modification, or destruction of information, and document risk assessment results.',                                  priority: 'P1', baseline: 'low'      },
  { id: 'RA-5',  family: 'RA', title: 'Vulnerability Monitoring and Scanning',          description: 'Monitor and scan for vulnerabilities in the information system and hosted applications on a defined frequency and when new vulnerabilities are identified, and employ vulnerability monitoring tools and techniques.',                                               priority: 'P1', baseline: 'moderate' },
  // SA — System and Services Acquisition (3)
  { id: 'SA-1',  family: 'SA', title: 'System and Services Acquisition Policy and Procedures', description: 'Develop, document, and disseminate system and services acquisition policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                              priority: 'P2', baseline: 'low'      },
  { id: 'SA-3',  family: 'SA', title: 'System Development Life Cycle',                  description: 'Manage the information system using a system development life cycle methodology that incorporates information security considerations, and identify roles and responsibilities throughout the system development life cycle.',                                        priority: 'P3', baseline: 'low'      },
  { id: 'SA-9',  family: 'SA', title: 'External Information System Services',           description: 'Require that providers of external information system services comply with organizational information security requirements and employ defined security controls in accordance with applicable laws and guidance.',                                                  priority: 'P2', baseline: 'low'      },
  // SC — System and Communications Protection (4)
  { id: 'SC-1',  family: 'SC', title: 'System and Communications Protection Policy and Procedures', description: 'Develop, document, and disseminate system and communications protection policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                    priority: 'P1', baseline: 'low'      },
  { id: 'SC-5',  family: 'SC', title: 'Denial-of-Service Protection',                   description: 'Protect the information system against or limit the effects of denial-of-service attacks, including types of denial-of-service events, and employ defined security safeguards.',                                                                                   priority: 'P1', baseline: 'moderate' },
  { id: 'SC-7',  family: 'SC', title: 'Boundary Protection',                            description: 'Monitor and control communications at the external boundary of the information system and at key internal boundaries within the system, and implement subnetworks for publicly accessible system components.',                                                       priority: 'P1', baseline: 'low'      },
  { id: 'SC-28', family: 'SC', title: 'Protection of Information at Rest',              description: 'Implement cryptographic mechanisms to prevent unauthorized disclosure and modification of information at rest unless otherwise protected by alternative physical safeguards.',                                                                                       priority: 'P1', baseline: 'moderate' },
  // SI — System and Information Integrity (4)
  { id: 'SI-1',  family: 'SI', title: 'System and Information Integrity Policy and Procedures', description: 'Develop, document, and disseminate system and information integrity policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                             priority: 'P1', baseline: 'low'      },
  { id: 'SI-2',  family: 'SI', title: 'Flaw Remediation',                               description: 'Identify, report, and correct information system flaws, test software and firmware updates related to flaw remediation for effectiveness and potential side effects before installation, and incorporate flaw remediation into the configuration management process.', priority: 'P1', baseline: 'low'      },
  { id: 'SI-3',  family: 'SI', title: 'Malicious Code Protection',                      description: 'Implement malicious code protection mechanisms at information system entry and exit points to detect and eradicate malicious code, and update malicious code protection mechanisms on a defined frequency.',                                                        priority: 'P1', baseline: 'low'      },
  { id: 'SI-7',  family: 'SI', title: 'Software, Firmware, and Information Integrity',  description: 'Employ integrity verification tools to detect unauthorized changes to software, firmware, and information, and take defined actions when unauthorized changes are detected.',                                                                                       priority: 'P1', baseline: 'high'     },
  // SR — Supply Chain Risk Management (3)
  { id: 'SR-1',  family: 'SR', title: 'Supply Chain Risk Management Policy and Procedures', description: 'Develop, document, and disseminate supply chain risk management policy and procedures covering purpose, scope, roles, responsibilities, management commitment, coordination, and compliance.',                                                                    priority: 'P1', baseline: 'high'     },
  { id: 'SR-3',  family: 'SR', title: 'Supply Chain Controls and Processes',            description: 'Establish a process or processes to identify and address weaknesses or deficiencies in the supply chain elements and processes used to produce, distribute, operate, and maintain organizational systems.',                                                         priority: 'P1', baseline: 'high'     },
  { id: 'SR-6',  family: 'SR', title: 'Supplier Assessments and Reviews',               description: 'Assess and review the supply chain-related risks associated with suppliers, system integrators, or contractors and document the results of such assessments and reviews.',                                                                                          priority: 'P1', baseline: 'high'     },
];

// ─── CMMC Level 2 ─────────────────────────────────────────────────────────────────
// 35 controls across 15 domains, based on NIST SP 800-171 Rev 2.

const CMMC_CONTROLS_SEED: ControlSeed[] = [
  // AC — Access Control (3)
  { id: 'AC.L2-3.1.1',  family: 'AC', title: 'Authorized Access Control',              description: 'Limit information system access to authorized users, processes acting on behalf of authorized users, and devices (including other systems), and to the types of transactions and functions that authorized users are permitted to execute.',                         priority: 'P1', baseline: 'applicable' },
  { id: 'AC.L2-3.1.2',  family: 'AC', title: 'Transaction and Function Control',       description: 'Limit system access to the types of transactions and functions that authorized users are permitted to execute, ensuring that all interactive sessions are controlled by a system access policy.',                                                                   priority: 'P1', baseline: 'applicable' },
  { id: 'AC.L2-3.1.5',  family: 'AC', title: 'Least Privilege',                        description: 'Employ the principle of least privilege, including for specific security functions and privileged accounts, to limit access to only those resources required to perform assigned duties.',                                                                           priority: 'P1', baseline: 'applicable' },
  // AM — Asset Management (2)
  { id: 'AM.L2-3.18.1', family: 'AM', title: 'System Component Inventory',             description: 'Establish and maintain an inventory of organizational systems and components that includes hardware, software, firmware, and associated documentation to support risk assessments involving CUI.',                                                                   priority: 'P2', baseline: 'applicable' },
  { id: 'AM.L2-3.18.2', family: 'AM', title: 'CUI Asset Identification',               description: 'Develop and maintain a list of systems, applications, and services that process, store, or transmit CUI to ensure comprehensive asset visibility and appropriate protection measures.',                                                                             priority: 'P2', baseline: 'applicable' },
  // AT — Awareness and Training (2)
  { id: 'AT.L2-3.2.1',  family: 'AT', title: 'Role-Based Risk Awareness',              description: 'Ensure that managers, systems administrators, and users of organizational systems are made aware of the security risks associated with their activities and current organizational policies and procedures.',                                                         priority: 'P2', baseline: 'applicable' },
  { id: 'AT.L2-3.2.2',  family: 'AT', title: 'Role-Based Training',                    description: 'Ensure that personnel are trained to carry out their assigned information security-related responsibilities, and maintain training records for a defined period to demonstrate compliance.',                                                                         priority: 'P2', baseline: 'applicable' },
  // AU — Audit and Accountability (3)
  { id: 'AU.L2-3.3.1',  family: 'AU', title: 'System Auditing',                        description: 'Create and retain system audit logs and records to the extent needed to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized system activity.',                                                                                priority: 'P1', baseline: 'applicable' },
  { id: 'AU.L2-3.3.2',  family: 'AU', title: 'User Accountability',                    description: 'Ensure that the actions of individual system users can be traced to those users so they can be held accountable for their actions, through unique identifiers and authenticated sessions.',                                                                         priority: 'P1', baseline: 'applicable' },
  { id: 'AU.L2-3.3.5',  family: 'AU', title: 'Audit Correlation',                      description: 'Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity across organizational systems.',                                                          priority: 'P1', baseline: 'applicable' },
  // CM — Configuration Management (3)
  { id: 'CM.L2-3.4.1',  family: 'CM', title: 'System Baselining',                      description: 'Establish and maintain baseline configurations and inventories of organizational systems, including hardware, software, firmware, and networks, and review and update the baselines on a defined frequency.',                                                       priority: 'P1', baseline: 'applicable' },
  { id: 'CM.L2-3.4.2',  family: 'CM', title: 'Security Configuration Enforcement',     description: 'Establish and enforce security configuration settings for information technology products employed in organizational systems, including using the most restrictive mode consistent with operational requirements.',                                                  priority: 'P1', baseline: 'applicable' },
  { id: 'CM.L2-3.4.6',  family: 'CM', title: 'Least Functionality',                    description: 'Employ the principle of least functionality by configuring organizational systems to provide only essential capabilities, prohibiting or restricting functions, ports, protocols, software, and services not required.',                                             priority: 'P1', baseline: 'applicable' },
  // IA — Identification and Authentication (3)
  { id: 'IA.L2-3.5.1',  family: 'IA', title: 'User Identification',                    description: 'Identify information system users, processes acting on behalf of users, and devices to support accountability and auditability of actions taken on the system.',                                                                                                  priority: 'P1', baseline: 'applicable' },
  { id: 'IA.L2-3.5.2',  family: 'IA', title: 'User Authentication',                    description: 'Authenticate (or verify) the identities of users, processes, or devices as a prerequisite to allowing access to organizational systems, using authenticators commensurate with the risk of the access.',                                                          priority: 'P1', baseline: 'applicable' },
  { id: 'IA.L2-3.5.3',  family: 'IA', title: 'Multi-Factor Authentication',            description: 'Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts to increase assurance of the claimed identity.',                                                                               priority: 'P1', baseline: 'applicable' },
  // IR — Incident Response (2)
  { id: 'IR.L2-3.6.1',  family: 'IR', title: 'Incident Handling',                      description: 'Establish an operational incident-handling capability for organizational systems that includes preparation, detection, analysis, containment, recovery, and user response activities, with testing on a defined frequency.',                                         priority: 'P1', baseline: 'applicable' },
  { id: 'IR.L2-3.6.2',  family: 'IR', title: 'Incident Reporting',                     description: 'Track, document, and report incidents to designated officials and/or authorities both internal and external to the organization, as required by applicable laws, regulations, and organizational policy.',                                                          priority: 'P1', baseline: 'applicable' },
  // MA — Maintenance (2)
  { id: 'MA.L2-3.7.1',  family: 'MA', title: 'Controlled Maintenance',                 description: 'Perform maintenance on organizational systems, approve and monitor all maintenance activities, control the tools, techniques, mechanisms, and personnel that conduct maintenance.',                                                                                 priority: 'P2', baseline: 'applicable' },
  { id: 'MA.L2-3.7.5',  family: 'MA', title: 'Multifactor Authentication for Remote Maintenance', description: 'Require multifactor authentication to establish nonlocal maintenance sessions via external network connections and terminate such connections when nonlocal maintenance is complete.',                                                                        priority: 'P2', baseline: 'applicable' },
  // MP — Media Protection (2)
  { id: 'MP.L2-3.8.1',  family: 'MP', title: 'Media Protection',                       description: 'Protect (i.e., physically control and securely store) system media containing CUI, both paper and digital, and limit access to CUI on system media to authorized users.',                                                                                         priority: 'P1', baseline: 'applicable' },
  { id: 'MP.L2-3.8.3',  family: 'MP', title: 'Media Sanitization',                     description: 'Sanitize or destroy system media before disposal or reuse using approved techniques and procedures to ensure that CUI cannot be recovered through any means.',                                                                                                     priority: 'P1', baseline: 'applicable' },
  // PS — Personnel Security (2)
  { id: 'PS.L2-3.9.1',  family: 'PS', title: 'Screen Individuals',                     description: 'Screen individuals prior to authorizing access to organizational systems containing CUI, consistent with the risk designated for the position.',                                                                                                                   priority: 'P1', baseline: 'applicable' },
  { id: 'PS.L2-3.9.2',  family: 'PS', title: 'Termination and Transfer',               description: 'Ensure that CUI and organizational systems containing CUI are protected during and after personnel actions such as terminations and transfers, including revoking access and recovering authenticators.',                                                            priority: 'P1', baseline: 'applicable' },
  // RA — Risk Assessment (2)
  { id: 'RA.L2-3.11.1', family: 'RA', title: 'Risk Assessments',                       description: 'Periodically assess the risk to organizational operations, assets, and individuals resulting from the operation of organizational systems and the associated processing, storage, or transmission of CUI.',                                                         priority: 'P1', baseline: 'applicable' },
  { id: 'RA.L2-3.11.2', family: 'RA', title: 'Vulnerability Scan',                     description: 'Scan for vulnerabilities in organizational systems and applications periodically and when new vulnerabilities affecting those systems are identified, and remediate vulnerabilities in accordance with risk assessments.',                                           priority: 'P1', baseline: 'applicable' },
  // RM — Risk Management (2)
  { id: 'RM.L2-3.11.3', family: 'RM', title: 'Vulnerability Remediation',              description: 'Remediate vulnerabilities in accordance with risk assessments, prioritizing based on criticality and the potential impact to CUI, within defined timelines for each risk tier.',                                                                                   priority: 'P1', baseline: 'applicable' },
  { id: 'RM.L2-3.12.1', family: 'RM', title: 'Security Requirement Satisfaction',      description: 'Periodically assess the security controls in organizational systems to determine if the controls are effective in their application, and develop a plan of action to address any deficiencies identified.',                                                         priority: 'P2', baseline: 'applicable' },
  // SA — Situational Awareness (2)
  { id: 'SA.L2-3.15.1', family: 'SA', title: 'Threat Intelligence',                    description: 'Receive and respond to cyber threat intelligence from information sharing forums and sources, and communicate to stakeholders consistent with organizational policies.',                                                                                            priority: 'P2', baseline: 'applicable' },
  { id: 'SA.L2-3.15.2', family: 'SA', title: 'Threat Indicators',                      description: 'Monitor systems to detect attacks and indicators of potential attacks in conformance with organizational policies, and respond to system anomalies that may indicate a security incident.',                                                                         priority: 'P2', baseline: 'applicable' },
  // SC — System and Communications Protection (3)
  { id: 'SC.L2-3.13.1', family: 'SC', title: 'Boundary Protection',                    description: 'Monitor, control, and protect communications at the external boundaries and key internal boundaries of organizational systems, and employ architectural designs, software development techniques, and systems engineering principles promoting security.',            priority: 'P1', baseline: 'applicable' },
  { id: 'SC.L2-3.13.8', family: 'SC', title: 'Data in Transit',                        description: 'Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission unless otherwise protected by alternative physical safeguards, using FIPS-validated algorithms.',                                                                  priority: 'P1', baseline: 'applicable' },
  { id: 'SC.L2-3.13.16', family: 'SC', title: 'Data at Rest',                          description: 'Protect the confidentiality of CUI at rest using cryptographic mechanisms or other approved protection methods, and ensure that access controls are applied to storage media containing CUI.',                                                                      priority: 'P1', baseline: 'applicable' },
  // SI — System and Information Integrity (2)
  { id: 'SI.L2-3.14.1', family: 'SI', title: 'Flaw Remediation',                       description: 'Identify, report, and correct information system flaws in a timely manner, test software and firmware updates for effectiveness and potential side effects before installation, and incorporate flaw remediation into configuration management.',                   priority: 'P1', baseline: 'applicable' },
  { id: 'SI.L2-3.14.6', family: 'SI', title: 'Security Alerts and Advisories',         description: 'Monitor the information system to detect attacks and indicators of potential attacks, unauthorized local, network, and remote connections, and take defined actions when indications of compromise are detected.',                                                   priority: 'P1', baseline: 'applicable' },
];

// ─── Framework definitions ────────────────────────────────────────────────────────────

const FRAMEWORK_DEFS: Record<string, { name: string; version: string; controls: ControlSeed[] }> = {
  fedramp_20x: { name: 'FedRAMP 20x',                    version: '2024', controls: FEDRAMP_CONTROLS_SEED  },
  cmmc_l2:     { name: 'CMMC Level 2',                    version: '2.0',  controls: CMMC_CONTROLS_SEED     },
  nist_csf:    { name: 'NIST Cybersecurity Framework',    version: '2.0',  controls: []                     },
  soc2:        { name: 'SOC 2 Type II',                   version: '2017', controls: []                     },
  iso27001:    { name: 'ISO/IEC 27001',                   version: '2022', controls: []                     },
};

const VALID_FRAMEWORK_KEYS = ['fedramp_20x', 'cmmc_l2', 'nist_csf', 'soc2', 'iso27001'] as const;
type ValidFrameworkKey = (typeof VALID_FRAMEWORK_KEYS)[number];

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const ControlsQuerySchema = z.object({
  family:  z.string().optional(),
  status:  z.string().optional(),
  page:    z.coerce.number().int().min(1).optional(),
  limit:   z.coerce.number().int().min(1).max(200).optional(),
});

const AssessmentPatchBody = z.object({
  status:             z.enum(['not_started', 'in_progress', 'implemented', 'not_applicable', 'inherited']).optional(),
  implementationNote: z.string().optional(),
  evidenceLinks:      z.array(z.string()).optional(),
  nextReviewAt:       z.string().optional(),
});

// ─── Seeding ──────────────────────────────────────────────────────────────────────

type FwPrisma = NonNullable<Awaited<ReturnType<typeof getDB>>['prisma']>;

/**
 * Deterministic SAMPLE assessment status so a freshly-bootstrapped tenant shows a
 * realistic spread (not a flat 0%). Index-based (no randomness) → reproducible.
 * Users overwrite these as they do real control work via the assessment PATCH.
 */
function demoAssessmentStatus(index: number): string {
  const cycle = index % 10;
  if (cycle < 4) return 'implemented';     // 40%
  if (cycle < 6) return 'in_progress';     // 20%
  if (cycle < 7) return 'not_applicable';  // 10%
  return 'not_started';                     // 30%
}

/**
 * Enable a framework and seed its controls + assessments. When `demo` is true,
 * assessments get the deterministic sample spread above; otherwise all not_started.
 * Idempotent (upserts). Returns the number of controls in the framework.
 */
export async function seedFrameworkForTenant(prisma: FwPrisma, tid: string, key: string, demo: boolean): Promise<number> {
  const def = FRAMEWORK_DEFS[key as ValidFrameworkKey];
  if (!def) return 0;

  await prisma.grcFramework.upsert({
    where:  { tenantId_key: { tenantId: tid, key } },
    create: {
      id:            uuidv7(),
      tenantId:      tid,
      key,
      name:          def.name,
      version:       def.version,
      totalControls: def.controls.length,
      enabledAt:     new Date(),
    },
    update: {},
  });

  const now = new Date();
  const BATCH_SIZE = 10;
  for (let i = 0; i < def.controls.length; i += BATCH_SIZE) {
    const batch = def.controls.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (ctrl, j) => {
        await prisma.grcControl.upsert({
          where:  { tenantId_frameworkKey_controlId: { tenantId: tid, frameworkKey: key, controlId: ctrl.id } },
          create: {
            id: uuidv7(), tenantId: tid, frameworkKey: key, controlId: ctrl.id,
            family: ctrl.family, title: ctrl.title, description: ctrl.description,
            priority: ctrl.priority, baseline: ctrl.baseline,
          },
          update: {},
        });
        const status = demo ? demoAssessmentStatus(i + j) : 'not_started';
        const assessed = status === 'implemented' || status === 'inherited';
        await prisma.grcControlAssessment.upsert({
          where:  { tenantId_frameworkKey_controlId: { tenantId: tid, frameworkKey: key, controlId: ctrl.id } },
          create: {
            id: uuidv7(), tenantId: tid, frameworkKey: key, controlId: ctrl.id,
            status, evidenceLinks: [],
            ...(assessed ? { assessedBy: 'sample-data', assessedAt: now } : {}),
          },
          update: {},
        });
      }),
    );
  }
  return def.controls.length;
}

// ─── Route plugin ─────────────────────────────────────────────────────────────────

export const grcFrameworksRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /frameworks ──────────────────────────────────────────────────────────
  app.get('/frameworks', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const tid = req.auth!.tid;
    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.code(503).send({ error: 'db_unavailable' });
    const prisma = db.prisma!;

    let [frameworks, statusGroups] = await Promise.all([
      prisma.grcFramework.findMany({
        where:   { tenantId: tid },
        orderBy: { enabledAt: 'desc' },
      }),
      prisma.grcControlAssessment.groupBy({
        by:    ['frameworkKey', 'status'],
        where: { tenantId: tid },
        _count: { status: true },
      }),
    ]);

    // First visit: bootstrap FedRAMP 20x + CMMC L2 with sample assessment data so the
    // page and dashboard show meaningful numbers immediately (mirrors the Defender seed).
    if (frameworks.length === 0) {
      for (const k of ['fedramp_20x', 'cmmc_l2']) {
        await seedFrameworkForTenant(prisma, tid, k, true);
      }
      [frameworks, statusGroups] = await Promise.all([
        prisma.grcFramework.findMany({ where: { tenantId: tid }, orderBy: { enabledAt: 'desc' } }),
        prisma.grcControlAssessment.groupBy({ by: ['frameworkKey', 'status'], where: { tenantId: tid }, _count: { status: true } }),
      ]);
    }

    const result = frameworks.map(fw => {
      const fwGroups = statusGroups.filter(g => g.frameworkKey === fw.key);
      const counts: Record<string, number> = {};
      for (const g of fwGroups) counts[g.status] = g._count.status;

      const implemented    = counts['implemented']    ?? 0;
      const in_progress    = counts['in_progress']    ?? 0;
      const not_started    = counts['not_started']    ?? 0;
      const not_applicable = counts['not_applicable'] ?? 0;
      const inherited      = counts['inherited']      ?? 0;
      const totalAssessed  = implemented + in_progress + not_started + not_applicable + inherited;
      const percentComplete = totalAssessed > 0
        ? Math.round((implemented + inherited) / totalAssessed * 100)
        : 0;

      return {
        key:           fw.key,
        name:          fw.name,
        version:       fw.version,
        totalControls: fw.totalControls,
        enabledAt:     fw.enabledAt.toISOString(),
        stats:         { implemented, in_progress, not_started, not_applicable, inherited, percentComplete },
      };
    });

    return { frameworks: result };
  });

  // ── POST /frameworks/:key/enable ───────────────────────────────────────────────
  app.post('/frameworks/:key/enable', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const { key } = req.params as { key: string };
    const tid = req.auth!.tid;

    if (!(VALID_FRAMEWORK_KEYS as readonly string[]).includes(key)) {
      return reply.code(400).send({ error: 'unknown_framework' });
    }

    const def = FRAMEWORK_DEFS[key as ValidFrameworkKey];
    if (!def) return reply.code(400).send({ error: 'unknown_framework' });

    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.code(503).send({ error: 'db_unavailable' });
    const prisma = db.prisma!;

    // Manual enable seeds real controls at not_started (no sample assessments).
    await seedFrameworkForTenant(prisma, tid, key, false);

    recordAudit({
      tenantId:     tid,
      actorUserId:  req.auth!.sub,
      actorRole:    req.auth!.roles[0] ?? 'compliance',
      action:       'grc.framework.enable',
      resourceType: 'grc_framework',
      resourceId:   key,
      beforeJson:   null,
      afterJson:    { key, controlsSeeded: def.controls.length },
    });

    return { ok: true, framework: key, controlsSeeded: def.controls.length };
  });

  // ── GET /frameworks/:key/controls ───────────────────────────────────────────────
  app.get('/frameworks/:key/controls', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const { key } = req.params as { key: string };
    const tid = req.auth!.tid;

    const parsed = ControlsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid query', issues: parsed.error.issues.slice(0, 5) });
    }
    const { family, status } = parsed.data;
    const page  = parsed.data.page  ?? 1;
    const limit = parsed.data.limit ?? 50;

    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.code(503).send({ error: 'db_unavailable' });
    const prisma = db.prisma!;

    const controlWhere = family
      ? { tenantId: tid, frameworkKey: key, family }
      : { tenantId: tid, frameworkKey: key };

    const [controls, assessments] = await Promise.all([
      prisma.grcControl.findMany({
        where:   controlWhere,
        orderBy: [{ family: 'asc' }, { controlId: 'asc' }],
      }),
      prisma.grcControlAssessment.findMany({
        where:  { tenantId: tid, frameworkKey: key },
        select: {
          controlId:          true,
          status:             true,
          implementationNote: true,
          evidenceLinks:      true,
          assessedBy:         true,
          assessedAt:         true,
          nextReviewAt:       true,
        },
      }),
    ]);

    const assessmentMap = new Map(assessments.map(a => [a.controlId, a]));

    const filtered = status !== undefined
      ? controls.filter(c => (assessmentMap.get(c.controlId)?.status ?? 'not_started') === status)
      : controls;

    const families = [...new Set(controls.map(c => c.family))].sort();
    const total = filtered.length;
    const skip  = (page - 1) * limit;
    const paged = filtered.slice(skip, skip + limit);

    const result = paged.map(c => {
      const a = assessmentMap.get(c.controlId);
      return {
        id:          c.id,
        controlId:   c.controlId,
        family:      c.family,
        title:       c.title,
        description: c.description,
        priority:    c.priority,
        baseline:    c.baseline,
        assessment:  a
          ? {
              status:             a.status,
              implementationNote: a.implementationNote ?? null,
              evidenceLinks:      a.evidenceLinks,
              assessedBy:         a.assessedBy ?? null,
              assessedAt:         a.assessedAt?.toISOString() ?? null,
              nextReviewAt:       a.nextReviewAt?.toISOString() ?? null,
            }
          : null,
      };
    });

    return { controls: result, total, families, page, limit };
  });

  // ── GET /frameworks/:key/controls/:controlId ────────────────────────────────────────
  app.get('/frameworks/:key/controls/:controlId', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const { key, controlId } = req.params as { key: string; controlId: string };
    const tid = req.auth!.tid;

    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.code(503).send({ error: 'db_unavailable' });
    const prisma = db.prisma!;

    const [control, assessment] = await Promise.all([
      prisma.grcControl.findUnique({
        where: { tenantId_frameworkKey_controlId: { tenantId: tid, frameworkKey: key, controlId } },
      }),
      prisma.grcControlAssessment.findUnique({
        where: { tenantId_frameworkKey_controlId: { tenantId: tid, frameworkKey: key, controlId } },
      }),
    ]);

    if (!control) return reply.code(404).send({ error: 'control_not_found' });

    return {
      id:          control.id,
      controlId:   control.controlId,
      family:      control.family,
      title:       control.title,
      description: control.description,
      priority:    control.priority,
      baseline:    control.baseline,
      assessment:  assessment
        ? {
            status:             assessment.status,
            implementationNote: assessment.implementationNote ?? null,
            evidenceLinks:      assessment.evidenceLinks,
            assessedBy:         assessment.assessedBy ?? null,
            assessedAt:         assessment.assessedAt?.toISOString() ?? null,
            nextReviewAt:       assessment.nextReviewAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  // ── PATCH /frameworks/:key/controls/:controlId/assessment ────────────────────────────
  app.patch('/frameworks/:key/controls/:controlId/assessment', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const { key, controlId } = req.params as { key: string; controlId: string };
    const tid = req.auth!.tid;

    const parsed = AssessmentPatchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid body', issues: parsed.error.issues.slice(0, 5) });
    }
    const body = parsed.data;

    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.code(503).send({ error: 'db_unavailable' });
    const prisma = db.prisma!;

    const control = await prisma.grcControl.findUnique({
      where: { tenantId_frameworkKey_controlId: { tenantId: tid, frameworkKey: key, controlId } },
    });
    if (!control) return reply.code(404).send({ error: 'control_not_found' });

    const now = new Date();
    const nextReviewDate = body.nextReviewAt ? new Date(body.nextReviewAt) : undefined;

    const assessment = await prisma.grcControlAssessment.upsert({
      where: { tenantId_frameworkKey_controlId: { tenantId: tid, frameworkKey: key, controlId } },
      create: {
        id:                 uuidv7(),
        tenantId:           tid,
        frameworkKey:       key,
        controlId,
        status:             body.status             ?? 'not_started',
        implementationNote: body.implementationNote ?? null,
        evidenceLinks:      body.evidenceLinks      ?? [],
        assessedBy:         req.auth!.sub,
        assessedAt:         now,
        nextReviewAt:       nextReviewDate ?? null,
      },
      update: {
        ...(body.status             !== undefined && { status:             body.status             }),
        ...(body.implementationNote !== undefined && { implementationNote: body.implementationNote }),
        ...(body.evidenceLinks      !== undefined && { evidenceLinks:      body.evidenceLinks      }),
        ...(nextReviewDate          !== undefined && { nextReviewAt:       nextReviewDate           }),
        assessedBy: req.auth!.sub,
        assessedAt: now,
      },
    });

    recordAudit({
      tenantId:     tid,
      actorUserId:  req.auth!.sub,
      actorRole:    req.auth!.roles[0] ?? 'compliance',
      action:       'grc.control.assess',
      resourceType: 'grc_control_assessment',
      resourceId:   `${key}/${controlId}`,
      beforeJson:   null,
      afterJson:    { key, controlId, status: assessment.status },
    });

    return {
      status:             assessment.status,
      implementationNote: assessment.implementationNote ?? null,
      evidenceLinks:      assessment.evidenceLinks,
      assessedBy:         assessment.assessedBy ?? null,
      assessedAt:         assessment.assessedAt?.toISOString()  ?? null,
      nextReviewAt:       assessment.nextReviewAt?.toISOString() ?? null,
      updatedAt:          assessment.updatedAt.toISOString(),
    };
  });

  // ── GET /frameworks/:key/dashboard ──────────────────────────────────────────────
  app.get('/frameworks/:key/dashboard', { preHandler: requireModule('itsec', 'viewer') }, async (req, reply) => {
    const { key } = req.params as { key: string };
    const tid = req.auth!.tid;

    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.code(503).send({ error: 'db_unavailable' });
    const prisma = db.prisma!;

    const [statusGroups, controls, assessments] = await Promise.all([
      prisma.grcControlAssessment.groupBy({
        by:    ['status'],
        where: { tenantId: tid, frameworkKey: key },
        _count: { status: true },
      }),
      prisma.grcControl.findMany({
        where:  { tenantId: tid, frameworkKey: key },
        select: { controlId: true, family: true },
      }),
      prisma.grcControlAssessment.findMany({
        where:  { tenantId: tid, frameworkKey: key },
        select: { controlId: true, status: true, nextReviewAt: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const g of statusGroups) counts[g.status] = g._count.status;

    const implemented    = counts['implemented']    ?? 0;
    const in_progress    = counts['in_progress']    ?? 0;
    const not_started    = counts['not_started']    ?? 0;
    const not_applicable = counts['not_applicable'] ?? 0;
    const inherited      = counts['inherited']      ?? 0;
    const total          = implemented + in_progress + not_started + not_applicable + inherited;
    const percentComplete = total > 0 ? Math.round((implemented + inherited) / total * 100) : 0;

    const assessmentStatusByControlId = new Map(assessments.map(a => [a.controlId, a.status]));
    const familyStats = new Map<string, { total: number; implemented: number }>();
    for (const c of controls) {
      const existing = familyStats.get(c.family) ?? { total: 0, implemented: 0 };
      existing.total += 1;
      const s = assessmentStatusByControlId.get(c.controlId);
      if (s === 'implemented' || s === 'inherited') existing.implemented += 1;
      familyStats.set(c.family, existing);
    }

    const byFamily = [...familyStats.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([family, stat]) => ({
        family,
        total:           stat.total,
        implemented:     stat.implemented,
        percentComplete: stat.total > 0 ? Math.round(stat.implemented / stat.total * 100) : 0,
      }));

    const now = new Date();
    const overdueReviews = assessments.filter(a => a.nextReviewAt !== null && a.nextReviewAt < now).length;

    return {
      frameworkKey: key,
      stats:        { implemented, in_progress, not_started, not_applicable, inherited, percentComplete },
      byFamily,
      overdueReviews,
    };
  });

  // ── GET /frameworks/:key/export ────────────────────────────────────────────────
  app.get('/frameworks/:key/export', { preHandler: requireModule('itsec', 'editor') }, async (req, reply) => {
    const { key } = req.params as { key: string };
    const tid = req.auth!.tid;

    const db = await getDB();
    if (!(db.ok && db.prisma)) return reply.code(503).send({ error: 'db_unavailable' });
    const prisma = db.prisma!;

    const [framework, controls, assessments] = await Promise.all([
      prisma.grcFramework.findUnique({
        where: { tenantId_key: { tenantId: tid, key } },
      }),
      prisma.grcControl.findMany({
        where:   { tenantId: tid, frameworkKey: key },
        orderBy: [{ family: 'asc' }, { controlId: 'asc' }],
      }),
      prisma.grcControlAssessment.findMany({
        where: { tenantId: tid, frameworkKey: key },
      }),
    ]);

    if (!framework) return reply.code(404).send({ error: 'framework_not_found' });

    const assessmentMap = new Map(assessments.map(a => [a.controlId, a]));

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      framework:  { key: framework.key, name: framework.name, version: framework.version },
      controls:   controls.map(c => {
        const a = assessmentMap.get(c.controlId);
        return {
          id:          c.id,
          controlId:   c.controlId,
          family:      c.family,
          title:       c.title,
          description: c.description,
          priority:    c.priority,
          baseline:    c.baseline,
          assessment:  a
            ? {
                status:             a.status,
                implementationNote: a.implementationNote ?? null,
                evidenceLinks:      a.evidenceLinks,
                assessedBy:         a.assessedBy ?? null,
                assessedAt:         a.assessedAt?.toISOString()  ?? null,
                nextReviewAt:       a.nextReviewAt?.toISOString() ?? null,
                updatedAt:          a.updatedAt.toISOString(),
              }
            : null,
        };
      }),
    };

    reply.header('Content-Disposition', `attachment; filename="grc-${key}-export-${Date.now()}.json"`);
    reply.header('Content-Type', 'application/json');
    return reply.send(exportPayload);
  });

};
