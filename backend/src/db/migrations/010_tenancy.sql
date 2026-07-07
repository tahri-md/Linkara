-- Tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL UNIQUE,
  level VARCHAR(50) NOT NULL CHECK (level IN ('ORGANIZATION', 'WORKSPACE', 'TEAM', 'PROJECT')),
  parent_tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tenant Members table
CREATE TABLE tenant_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(100) NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, user_id)
);

-- Tenant Isolation Configs table
CREATE TABLE tenant_isolation_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  data_isolation VARCHAR(50) NOT NULL DEFAULT 'STRICT' CHECK (data_isolation IN ('STRICT', 'SHARED', 'HYBRID')),
  resource_sharing BOOLEAN NOT NULL DEFAULT false,
  cross_tenant_access BOOLEAN NOT NULL DEFAULT false,
  custom_metadata BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tenant Quotas table
CREATE TABLE tenant_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  max_users INTEGER NOT NULL DEFAULT 50,
  max_workflows INTEGER NOT NULL DEFAULT 100,
  max_jobs INTEGER NOT NULL DEFAULT 1000,
  max_storage BIGINT NOT NULL DEFAULT 10737418240,
  max_webhooks INTEGER NOT NULL DEFAULT 50,
  storage_used BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_parent_tenant_id ON tenants(parent_tenant_id);
CREATE INDEX idx_tenants_level ON tenants(level);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenant_members_tenant_id ON tenant_members(tenant_id);
CREATE INDEX idx_tenant_members_user_id ON tenant_members(user_id);
CREATE INDEX idx_tenant_isolation_configs_tenant_id ON tenant_isolation_configs(tenant_id);
CREATE INDEX idx_tenant_quotas_tenant_id ON tenant_quotas(tenant_id);

COMMENT ON TABLE tenants IS 'Multi-level tenant hierarchy supporting ORGANIZATION > WORKSPACE > TEAM > PROJECT';
COMMENT ON TABLE tenant_members IS 'Tracks user memberships in tenants with role assignments';
COMMENT ON TABLE tenant_isolation_configs IS 'Isolation and access control configuration for each tenant';
COMMENT ON TABLE tenant_quotas IS 'Resource quotas and usage tracking for each tenant';
