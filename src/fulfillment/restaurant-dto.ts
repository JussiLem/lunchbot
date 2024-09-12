export interface RestaurantDto {
  readonly restaurant: string
  readonly officeLocation: string
  readonly cuisineType: string
  readonly visits?: number
  readonly rating?: number
}
