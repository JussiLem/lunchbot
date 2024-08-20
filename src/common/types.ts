interface Restaurant {
  name: string
  address: string
  menu?: Record<string, unknown> | null
}

interface RestaurantOption {
  cuisineType: string
  restaurants: Restaurant[]
}

export interface Lunch {
  officeLocation: string
  restaurantOptions: RestaurantOption[]
}
