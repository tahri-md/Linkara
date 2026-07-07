CREATE TABLE org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  email VARCHAR(255) NOT NULL,
  role org_role DEFAULT 'VIEWER',
  token VARCHAR(64) UNIQUE NOT NULL,
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'pending', -- pending | accepted | revoked | expired
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  accepted_at TIMESTAMP
);

CREATE INDEX idx_org_invites_org_id ON org_invites(org_id);
CREATE INDEX idx_org_invites_token ON org_invites(token);
CREATE INDEX idx_org_invites_email ON org_invites(email);

-- Prevent duplicate pending invites for the same org+email
CREATE UNIQUE INDEX idx_org_invites_unique_pending
  ON org_invites(org_id, email)
  WHERE status = 'pending';

COMMENT ON TABLE org_invites IS 'Pending organization membership invitations, accepted via emailed token';