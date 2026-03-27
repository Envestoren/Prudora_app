export type Message = {
  id: string;
  content: string;
  created_at: string;
};

export type Store = {
  id: string;
  chain: string;
  name: string | null;
  address: string;
  latitude: number;
  longitude: number;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductCategory = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type Product = {
  id: string;
  name: string;
  supplier: string;
  manufacturer: string;
  unit: string;
  unit_price_amount: number;
  is_weight_item: boolean;
  category_id: string | null;
  image_url: string | null;
  barcode: string | null;
  approval_status: 'pending' | 'approved' | 'rejected';
  submitted_by: string | null;
  submitted_at: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Profile = {
  id: string;
  first_name: string;
  last_name: string;
  age: number;
  is_admin: boolean;
  is_price_verified: boolean;
  price_verification_requested_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PriceSettings = {
  id: number;
  requires_price_approval: boolean;
  updated_at: string;
};

export type ProductPrice = {
  id: string;
  product_id: string;
  store_id: string;
  user_id: string;
  price_amount: number;
  recorded_at: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
};

export type UserProductPriceAlert = {
  id: string;
  user_id: string;
  product_id: string;
  enabled: boolean;
  percent_drop: number | null;
  absolute_drop_kr: number | null;
  threshold_price: number | null;
  created_at: string;
  updated_at: string;
};
