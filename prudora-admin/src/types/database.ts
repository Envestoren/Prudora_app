export type Profile = {
  id: string
  first_name: string
  last_name: string
  age: number
  email: string | null
  is_admin: boolean
  created_at: string
  updated_at: string
}

export type Store = {
  id: string
  chain: string
  name: string | null
  address: string
  latitude: number
  longitude: number
  logo_url: string | null
  created_at: string
  updated_at: string
}

export type ProductCategory = {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export type Product = {
  id: string
  name: string
  supplier: string
  manufacturer: string
  unit: string
  unit_price_amount: number
  is_weight_item: boolean
  category_id: string | null
  image_url: string | null
  created_at: string
  updated_at: string
}
