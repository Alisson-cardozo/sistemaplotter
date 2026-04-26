CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL,
  phone_whatsapp VARCHAR(25) NULL,
  is_paid TINYINT(1) NOT NULL DEFAULT 0,
  active_plan_id BIGINT UNSIGNED NULL,
  plan_expires_at DATETIME NULL,
  manual_access_expires_at DATETIME NULL,
  manual_access_bandeiras TINYINT(1) NOT NULL DEFAULT 0,
  manual_access_painel TINYINT(1) NOT NULL DEFAULT 0,
  manual_access_plotagem_gomo TINYINT(1) NOT NULL DEFAULT 0,
  manual_access_tabela_molde TINYINT(1) NOT NULL DEFAULT 0,
  manual_access_moldes_salvos TINYINT(1) NOT NULL DEFAULT 0,
  manual_access_storefront TINYINT(1) NOT NULL DEFAULT 0,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','user') NOT NULL DEFAULT 'user',
  access_status ENUM('active','blocked') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketplace_products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  image_url VARCHAR(500) NULL,
  images_json LONGTEXT NULL,
  whatsapp_number VARCHAR(25) NOT NULL,
  status ENUM('active','sold') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_products_user (user_id),
  CONSTRAINT fk_marketplace_products_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS moldes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  nome_projeto VARCHAR(180) NOT NULL,
  modelo VARCHAR(80) NOT NULL,
  quantidade_gomos INT NOT NULL DEFAULT 0,
  comprimento_gomo_cm DECIMAL(12,2) NOT NULL DEFAULT 0,
  diametro_boca_cm DECIMAL(12,2) NOT NULL DEFAULT 0,
  bainha_cm DECIMAL(10,2) NOT NULL DEFAULT 0,
  payload_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_moldes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS arquivos_montados_taco (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  nome_projeto VARCHAR(180) NOT NULL,
  modelo VARCHAR(80) NOT NULL,
  quantidade_gomos INT NOT NULL DEFAULT 0,
  comprimento_gomo_cm DECIMAL(12,2) NOT NULL DEFAULT 0,
  diametro_boca_cm DECIMAL(12,2) NOT NULL DEFAULT 0,
  bainha_cm DECIMAL(10,2) NOT NULL DEFAULT 0,
  payload_json LONGTEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_arquivos_montados_taco_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_plans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  price DECIMAL(12,2) NOT NULL DEFAULT 0,
  duration_days INT NOT NULL DEFAULT 30,
  image_path VARCHAR(500) NULL,
  image_data LONGTEXT NULL,
  is_promo TINYINT(1) NOT NULL DEFAULT 0,
  is_most_popular TINYINT(1) NOT NULL DEFAULT 0,
  access_bandeiras TINYINT(1) NOT NULL DEFAULT 0,
  access_painel TINYINT(1) NOT NULL DEFAULT 0,
  access_plotagem_gomo TINYINT(1) NOT NULL DEFAULT 1,
  access_tabela_molde TINYINT(1) NOT NULL DEFAULT 1,
  access_moldes_salvos TINYINT(1) NOT NULL DEFAULT 1,
  access_storefront TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payment_settings (
  id TINYINT UNSIGNED NOT NULL,
  public_key VARCHAR(255) NOT NULL DEFAULT '',
  access_token VARCHAR(255) NOT NULL DEFAULT '',
  webhook_secret VARCHAR(255) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tutorial_settings (
  id TINYINT UNSIGNED NOT NULL,
  description TEXT NOT NULL,
  youtube_url VARCHAR(500) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tutorial_library (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  youtube_url VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS plan_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  plan_id BIGINT UNSIGNED NOT NULL,
  mercadopago_payment_id VARCHAR(80) NULL,
  external_reference VARCHAR(160) NOT NULL,
  payment_status VARCHAR(40) NOT NULL DEFAULT 'pending',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  duration_days INT NOT NULL DEFAULT 30,
  pix_code LONGTEXT NULL,
  qr_code_base64 LONGTEXT NULL,
  expires_at DATETIME NULL,
  approved_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_plan_orders_reference (external_reference),
  CONSTRAINT fk_plan_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_plan_orders_plan FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS admin_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_admin_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_suggestions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL DEFAULT 5,
  subject VARCHAR(180) NOT NULL,
  suggestion TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_suggestions_user (user_id),
  CONSTRAINT fk_user_suggestions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_suggestion_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  suggestion_id BIGINT UNSIGNED NOT NULL,
  sender_role ENUM('user','admin') NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_user_suggestion_messages_suggestion (suggestion_id),
  CONSTRAINT fk_user_suggestion_messages_suggestion FOREIGN KEY (suggestion_id) REFERENCES user_suggestions(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_suggestion_hidden_threads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  suggestion_id BIGINT UNSIGNED NOT NULL,
  hidden_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_suggestion_hidden_threads_user_suggestion (user_id, suggestion_id),
  KEY idx_user_suggestion_hidden_threads_user (user_id),
  KEY idx_user_suggestion_hidden_threads_suggestion (suggestion_id),
  CONSTRAINT fk_user_suggestion_hidden_threads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_user_suggestion_hidden_threads_suggestion FOREIGN KEY (suggestion_id) REFERENCES user_suggestions(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NULL,
  audience ENUM('admin','user') NOT NULL,
  type VARCHAR(60) NOT NULL,
  title VARCHAR(180) NOT NULL,
  body TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_notifications_audience (audience),
  KEY idx_notifications_user (user_id),
  KEY idx_notifications_read (is_read),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO payment_settings (id, public_key, access_token, webhook_secret)
VALUES (1, '', '', '')
ON DUPLICATE KEY UPDATE id = VALUES(id);

-- =========================================================
-- ADMIN INICIAL DO SISTEMA
-- Email: admin@alissonprojetos.com
-- Senha: Admin@123
-- A senha fica salva em hash; o sistema apenas le do banco.
-- =========================================================
INSERT INTO users (
  name,
  email,
  phone_whatsapp,
  is_paid,
  password_hash,
  role,
  access_status,
  manual_access_bandeiras,
  manual_access_painel,
  manual_access_plotagem_gomo,
  manual_access_tabela_molde,
  manual_access_moldes_salvos,
  manual_access_storefront
)
SELECT
  'Administrador',
  'admin@alissonprojetos.com',
  NULL,
  1,
  '$2y$12$VGtWHgsNtl9AhTb/8PieCOXkIkKIumH6qHiA.1io.mujlaJ41yf92',
  'admin',
  'active',
  1,
  1,
  1,
  1,
  1,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE email = 'admin@alissonprojetos.com'
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  last_used_at DATETIME NULL,
  expires_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_api_tokens_hash (token_hash),
  KEY idx_api_tokens_user (user_id),
  CONSTRAINT fk_api_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
